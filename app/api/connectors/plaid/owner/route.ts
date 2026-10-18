import { choosePlaidOwner, plaidConfigured } from "@/lib/plaid";
import { getTwin, rebuildTwin } from "@/lib/twin";
import { currentUser } from "@/lib/user";

/**
 * The answer to "which of these is you?". Body: { owner: number } (index into choose.owners) or { owner: null }
 * for "none of these", which disconnects the bank. Imports that person's details and rebuilds the twin.
 */
export async function POST(req: Request) {
  const user = currentUser(req);
  if (!plaidConfigured()) {
    return Response.json({ error: "Bank connections aren't set up on this server (PLAID_CLIENT_ID and PLAID_SECRET)" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { owner?: unknown };
  const owner = body.owner === null ? null : Number.isInteger(body.owner) ? (body.owner as number) : undefined;
  if (owner === undefined) return Response.json({ error: "owner must be an index or null" }, { status: 400 });

  let result;
  try {
    result = await choosePlaidOwner(user, owner);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
  if (result.status !== "imported") return Response.json({ ...result, twin: getTwin(user) });
  try {
    return Response.json({ ...result, twin: await rebuildTwin(user, { removed: true }) });
  } catch (e) {
    return Response.json({ ...result, error: `Got your bank details, but the twin wasn't updated. ${(e as Error).message}` }, { status: 500 });
  }
}
