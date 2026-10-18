import { connection } from "next/server";
import { db } from "@/lib/db";
import { pendingChoice, plaidConfigured, plaidConnection, plaidEnv, removePlaid } from "@/lib/plaid";
import { getTwin, rebuildTwin } from "@/lib/twin";
import { currentUser } from "@/lib/user";

/**
 * Bank status for ConnectBank: { configured, env, connected, institution?, choose? }. configured false means
 * PLAID_CLIENT_ID / PLAID_SECRET aren't set and the bank option is hidden. choose is a pending "which of these
 * is you?" (also after the OAuth-bank round trip through /formly/plaid-oauth).
 */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  if (!plaidConfigured()) return Response.json({ configured: false, connected: false }, { headers: { "Cache-Control": "no-store" } });
  const item = plaidConnection(user);
  const choose = item ? pendingChoice(user) : null;
  return Response.json(
    {
      configured: true,
      env: plaidEnv(),
      connected: !!item && !choose,
      ...(item ? { institution: item.institution } : {}),
      ...(choose ? { choose } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Disconnect: /item/remove at Plaid, forget the token, drop this visitor's bank sources and rebuild the twin. */
export async function DELETE(req: Request) {
  const user = currentUser(req);
  if (!plaidConfigured()) {
    return Response.json({ error: "Bank connections aren't set up on this server (PLAID_CLIENT_ID and PLAID_SECRET)" }, { status: 400 });
  }
  await removePlaid(user);
  const { changes } = db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'plaid'").run(user);
  try {
    return Response.json({ twin: changes ? await rebuildTwin(user, { removed: true }) : getTwin(user) });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
