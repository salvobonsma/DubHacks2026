import { createLinkToken, plaidConfigured } from "@/lib/plaid";
import { originOf } from "@/lib/oauth";
import { currentUser } from "@/lib/user";

/** POST → { link_token, expiration } for Plaid Link, bound to this visitor (redirect_uri = {origin}/formly/plaid-oauth). */
export async function POST(req: Request) {
  const user = currentUser(req);
  if (!plaidConfigured()) {
    return Response.json({ error: "Bank connections aren't set up on this server (PLAID_CLIENT_ID and PLAID_SECRET)" }, { status: 400 });
  }
  try {
    return Response.json(await createLinkToken(user, originOf(req)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: `Couldn't start the bank connection: ${(e as Error).message}` }, { status: 502 });
  }
}
