import { nanoid } from "nanoid";
import { connection } from "next/server";
import { db } from "@/lib/db";
import type { FormSchema } from "@/lib/types";
import { originOf } from "@/lib/oauth";
import { claimSession, currentUser, isFreshUser, ownSession, sessionResult } from "@/lib/user";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { headers: cors });
}

/** The origins this server answers on: the host the request used, and PUBLIC_ORIGIN / originOf. */
function ownOrigins(req: Request): Set<string> {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(/:$/, "");
  const out = new Set([`${proto}://${host}`, originOf(req)]);
  const fixed = process.env.PUBLIC_ORIGIN?.trim();
  if (fixed) out.add(fixed.replace(/\/+$/, ""));
  return out;
}

/** Merchants on other origins allowed to open Formly: FORMLY_MERCHANT_ORIGINS, comma separated. */
function merchantOrigins(): Set<string> {
  const out = new Set<string>();
  for (const o of (process.env.FORMLY_MERCHANT_ORIGINS ?? "").split(",")) {
    try {
      if (o.trim()) out.add(new URL(o.trim()).origin);
    } catch {}
  }
  return out;
}

/**
 * Business side: register the blank form schema and get a session for the popup.
 * `returnUrl` is the merchant page: its origin is the postMessage target, and it's where a
 * same-tab flow (popup blocked) redirects back to with ?formly_session=<id>. It must be a page on this
 * site or on an allowlisted merchant origin, so approved answers can't be sent (or a visitor redirected)
 * anywhere else.
 * A merchant page on this site shares Formly's cookie, so the session belongs to the visitor whose browser
 * created it and nobody else can open it. An allowlisted merchant on another origin sends no cookie, so its
 * session starts unowned and the Formly popup claims it for the visitor who opens it (PATCH claim).
 */
export async function POST(req: Request) {
  const { schema, returnUrl } = (await req.json().catch(() => ({}))) as { schema?: FormSchema; returnUrl?: string };
  if (!schema?.fields?.length) return Response.json({ error: "Invalid schema" }, { status: 400, headers: cors });
  let back: URL | null = null;
  try {
    back = new URL(returnUrl ?? "");
  } catch {}
  const own = !!back && ownOrigins(req).has(back.origin);
  if (!back || !/^https?:$/.test(back.protocol) || (!own && !merchantOrigins().has(back.origin)))
    return Response.json({ error: "returnUrl must be a page on this site or an allowed merchant origin" }, { status: 400, headers: cors });
  const user = own || !isFreshUser(req) ? currentUser(req) : null;
  const id = nanoid();
  db.prepare("INSERT INTO sessions (id, user_id, business, schema_json, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    user,
    schema.business,
    JSON.stringify(schema),
    back.href,
    Date.now(),
  );
  return Response.json({ sessionId: id }, { headers: cors });
}

/** Only the session's owner can read it (schema and approved answers); anyone else gets a 404. Never claims. */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id || !ownSession(id, user)) return Response.json({ error: "Not found" }, { status: 404, headers: cors });
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | { id: string; business: string; schema_json: string; origin: string | null; status: string }
    | undefined;
  if (!row) return Response.json({ error: "Not found" }, { status: 404, headers: cors });
  const result = sessionResult(id, user);
  return Response.json(
    {
      id: row.id,
      business: row.business,
      returnUrl: row.origin,
      status: row.status,
      schema: JSON.parse(row.schema_json),
      values: result?.values ?? null,
      suggested: result?.suggested ?? [],
    },
    { headers: cors },
  );
}

/**
 * Formly side. {sessionId, claim: true}: the popup takes an unowned session for this visitor; only from
 * Formly's own pages (the browser's Origin header), so another site can't claim it for a throwaway visitor.
 * Otherwise the user approved: store only the approved answers for the merchant to collect. Owner only.
 */
export async function PATCH(req: Request) {
  const user = currentUser(req);
  const { sessionId, values, suggested, status, claim } = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    values?: Record<string, string>;
    /** Field ids among `values` that are Formly's suggestions (plan, lines…), not facts copied from the data. */
    suggested?: string[];
    status?: "completed" | "cancelled";
    claim?: boolean;
  };
  if (claim) {
    const from = req.headers.get("origin");
    if (!sessionId || !from || !ownOrigins(req).has(from) || !claimSession(sessionId, user))
      return Response.json({ error: "Not found" }, { status: 404, headers: cors });
    return Response.json({ ok: true }, { headers: cors });
  }
  if (!sessionId || !ownSession(sessionId, user)) return Response.json({ error: "Not found" }, { status: 404, headers: cors });
  if (status && status !== "completed" && status !== "cancelled")
    return Response.json({ error: "Invalid status" }, { status: 400, headers: cors });
  if (values) {
    const marked = Array.isArray(suggested) ? suggested.filter((id) => typeof id === "string" && id in values) : [];
    db.prepare(
      `INSERT INTO session_results (session_id, user_id, values_json, suggested_json, completed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET values_json = excluded.values_json, suggested_json = excluded.suggested_json,
         completed_at = excluded.completed_at`,
    ).run(sessionId, user, JSON.stringify(values), JSON.stringify(marked), Date.now());
  }
  db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status ?? "completed", sessionId);
  return Response.json({ ok: true }, { headers: cors });
}
