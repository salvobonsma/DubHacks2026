import { db } from "@/lib/db";
import { GOOGLE_SYNC_SCOPES, googleConfigured, googleConnection, importGoogle, revokeGoogle, type GoogleScope } from "@/lib/google";
import { getTwin, rebuildTwin } from "@/lib/twin";
import { currentUser } from "@/lib/user";

/**
 * Sync the visitor's connected Google account (live OAuth only; the sample-data persona lives at
 * /api/connectors/google/demo and is only offered on /demo). Picker mode only ever imports the profile,
 * whatever is asked for. Body: { scopes?: ("profile" | "contacts" | "gmail" | "drive")[] }.
 */
export async function POST(req: Request) {
  const user = currentUser(req);
  if (!googleConfigured()) return Response.json({ error: "Google sign-in isn't set up on this server" }, { status: 400 });
  if (!googleConnection(user)) return Response.json({ error: "Connect your Google account first" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { scopes?: string[] };
  const scopes = GOOGLE_SYNC_SCOPES.filter((s) => (body.scopes ?? GOOGLE_SYNC_SCOPES).includes(s)) as GoogleScope[];
  if (scopes.length === 0) return Response.json({ error: "Pick at least one thing to share" }, { status: 400 });

  let errors: string[];
  try {
    ({ errors } = await importGoogle(user, scopes));
  } catch (e) {
    return Response.json({ error: `Couldn't sync Google: ${(e as Error).message}` }, { status: 502 });
  }
  try {
    return Response.json({ twin: await rebuildTwin(user, { removed: true }), errors });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}`, errors }, { status: 500 });
  }
}

/** Disconnect: revoke + forget this visitor's Google tokens and remove every google source of theirs. */
export async function DELETE(req: Request) {
  const user = currentUser(req);
  await revokeGoogle(user);
  const { changes } = db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'google'").run(user);
  try {
    // Skip the (LLM-backed) rebuild when there was nothing to remove.
    return Response.json({ twin: changes ? await rebuildTwin(user, { removed: true }) : getTwin(user) });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
