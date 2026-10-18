import { connection } from "next/server";
import { db } from "@/lib/db";
import { getTokens } from "@/lib/oauth";
import { revokeGoogleToken } from "@/lib/google";
import { currentUser, expiresAt, ttlLabel, wipeUser } from "@/lib/user";

/** This visitor's data at a glance: how many sources, and when it all auto-deletes. */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM sources WHERE user_id = ?").get(user) as { n: number };
  return Response.json({ sources: n, expiresAt: expiresAt(user), ttl: ttlLabel() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * "Delete my data": every row this visitor owns, in every per-user table (sources, twin, edits, grants,
 * sessions and their answers, OAuth tokens, scan links, logins), right now. The Google grant is revoked at
 * Google first, so Formly's access ends there too.
 */
export async function DELETE(req: Request) {
  const user = currentUser(req);
  const google = getTokens(user, "google");
  const token = google?.refresh_token ?? google?.access_token;
  if (token) await revokeGoogleToken(token);
  const deleted = wipeUser(user, { revoked: true });
  return Response.json({ ok: true, deleted });
}
