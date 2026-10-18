import { nanoid } from "nanoid";
import { connection } from "next/server";
import { db } from "@/lib/db";
import type { FormSchema } from "@/lib/types";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { headers: cors });
}

/**
 * Business side: register the blank form schema and get a session for the popup.
 * `returnUrl` is the merchant page: its origin is the postMessage target, and it's where a
 * same-tab flow (popup blocked) redirects back to with ?formly_session=<id>.
 */
export async function POST(req: Request) {
  const { schema, returnUrl } = (await req.json()) as { schema: FormSchema; returnUrl?: string };
  if (!schema?.fields?.length) return Response.json({ error: "Invalid schema" }, { status: 400, headers: cors });
  const id = nanoid();
  db.prepare("INSERT INTO sessions (id, business, schema_json, origin, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    schema.business,
    JSON.stringify(schema),
    returnUrl ?? null,
    Date.now(),
  );
  return Response.json({ sessionId: id }, { headers: cors });
}

export async function GET(req: Request) {
  await connection();
  const id = new URL(req.url).searchParams.get("id");
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | { id: string; business: string; schema_json: string; origin: string | null; status: string }
    | undefined;
  if (!row) return Response.json({ error: "Not found" }, { status: 404, headers: cors });
  const result = db.prepare("SELECT values_json FROM session_results WHERE session_id = ?").get(id) as
    | { values_json: string }
    | undefined;
  return Response.json(
    {
      id: row.id,
      business: row.business,
      returnUrl: row.origin,
      status: row.status,
      schema: JSON.parse(row.schema_json),
      values: result ? JSON.parse(result.values_json) : null,
    },
    { headers: cors },
  );
}

/** Formly side: the user approved; store only the approved answers for the merchant to collect. */
export async function PATCH(req: Request) {
  const { sessionId, values, status } = (await req.json()) as {
    sessionId: string;
    values?: Record<string, string>;
    status?: "completed" | "cancelled";
  };
  if (values) {
    db.prepare(
      `INSERT INTO session_results (session_id, values_json, completed_at) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET values_json = excluded.values_json, completed_at = excluded.completed_at`,
    ).run(sessionId, JSON.stringify(values), Date.now());
  }
  db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status ?? "completed", sessionId);
  return Response.json({ ok: true }, { headers: cors });
}
