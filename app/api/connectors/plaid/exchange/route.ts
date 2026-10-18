import { exchangePublicToken, importPlaid, plaidConfigured } from "@/lib/plaid";
import { rebuildTwin } from "@/lib/twin";
import { currentUser } from "@/lib/user";

/**
 * After Plaid Link succeeds. Body: { public_token, institution? } (institution: Link's metadata.institution.name,
 * a display label only). Swaps the token, reads identity + 90 days of transactions into bank sources and rebuilds
 * the twin: { status: "imported", owner, institution, twin, errors }. When the bank's owner isn't clearly the
 * Google profile's person: { status: "choose", owners, profileName, institution }, answered at ./owner.
 */
export async function POST(req: Request) {
  const user = currentUser(req);
  if (!plaidConfigured()) {
    return Response.json({ error: "Bank connections aren't set up on this server (PLAID_CLIENT_ID and PLAID_SECRET)" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { public_token?: unknown; institution?: unknown };
  const publicToken = typeof body.public_token === "string" ? body.public_token.trim() : "";
  if (!/^public-[a-z]+-[\w-]+$/.test(publicToken)) return Response.json({ error: "Missing or malformed public_token" }, { status: 400 });
  const institution = typeof body.institution === "string" ? body.institution.replace(/[^\w &'.,()-]/g, "").trim() || null : null;

  let result;
  try {
    await exchangePublicToken(user, publicToken, institution);
    result = await importPlaid(user);
  } catch (e) {
    return Response.json({ error: `Couldn't read your bank: ${(e as Error).message}` }, { status: 502 });
  }
  if (result.status === "choose") return Response.json(result);
  try {
    return Response.json({ ...result, twin: await rebuildTwin(user, { removed: true }) });
  } catch (e) {
    return Response.json({ ...result, error: `Got your bank details, but the twin wasn't updated. ${(e as Error).message}` }, { status: 500 });
  }
}
