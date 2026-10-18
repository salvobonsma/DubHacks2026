import { connection } from "next/server";
import { MICROSOFT_STATE_COOKIE, microsoftAuthUrl, microsoftConfigured } from "@/lib/microsoft";
import { newState, oauthRedirectAllowed, originOf, safeReturnTo } from "@/lib/oauth";
import { currentUser } from "@/lib/user";

/** Sends the browser to Microsoft's consent screen (PKCE + single-use state), or back with an error. */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  const origin = originOf(req);
  const returnTo = safeReturnTo(new URL(req.url).searchParams.get("returnTo"));

  if (!microsoftConfigured()) {
    const back = new URL(returnTo, origin);
    back.searchParams.set("connect_error", "Microsoft sign-in isn't set up. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.");
    return Response.redirect(back, 302);
  }

  if (!oauthRedirectAllowed(origin)) {
    const back = new URL(returnTo, origin);
    back.searchParams.set("connect_error", "Microsoft sign-in only works on localhost or an https address.");
    return Response.redirect(back, 302);
  }

  // The cookie ties the state to this browser, so a callback URL started elsewhere (login CSRF) is refused.
  const { state, challenge } = newState(user, "microsoft", returnTo);
  const secure = origin.startsWith("https:") ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      Location: microsoftAuthUrl(origin, state, challenge),
      "Set-Cookie": `${MICROSOFT_STATE_COOKIE}=${state}; Path=/api/connectors/microsoft; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
      "Cache-Control": "no-store",
    },
  });
}
