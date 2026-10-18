import { db } from "@/lib/db";
import {
  importMicrosoft,
  microsoftConfigured,
  microsoftConnection,
  MICROSOFT_SYNC_SCOPES,
} from "@/lib/microsoft";
import { deleteTokens } from "@/lib/oauth";
import { getTwin, rebuildTwin } from "@/lib/twin";
import { currentUser } from "@/lib/user";

/**
 * Re-sync the connected Microsoft account (OneDrive + Outlook) for the scopes the user left checked.
 * Body: { scopes?: ("profile" | "onedrive" | "outlook")[] }. There is no demo fallback for Microsoft.
 */
export async function POST(req: Request) {
  const user = currentUser(req);
  if (!microsoftConfigured()) {
    return Response.json({ error: "Microsoft sign-in isn't set up on this server" }, { status: 400 });
  }
  if (!microsoftConnection(user)) return Response.json({ error: "Connect your Microsoft account first" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { scopes?: string[] };
  const scopes = MICROSOFT_SYNC_SCOPES.filter((s) => (body.scopes ?? MICROSOFT_SYNC_SCOPES).includes(s));
  if (scopes.length === 0) return Response.json({ error: "Pick at least one thing to share" }, { status: 400 });

  try {
    await importMicrosoft(user, scopes);
  } catch (e) {
    return Response.json({ error: `Couldn't sync Microsoft: ${(e as Error).message}` }, { status: 502 });
  }
  try {
    return Response.json({ twin: await rebuildTwin(user, { removed: true }) });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Disconnect: forget this visitor's tokens and every Microsoft source, then rebuild the twin without them. */
export async function DELETE(req: Request) {
  const user = currentUser(req);
  deleteTokens(user, "microsoft");
  const { changes } = db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'microsoft'").run(user);
  try {
    // Skip the (LLM-backed) rebuild when there was nothing to remove.
    return Response.json({ twin: changes ? await rebuildTwin(user, { removed: true }) : getTwin(user) });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
