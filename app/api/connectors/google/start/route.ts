import { connection } from "next/server";
import { GOOGLE_STATE_COOKIE, googleAccess, googleAuthUrl, googleConfigured } from "@/lib/google";
import { newState, oauthRedirectAllowed, originOf, safeReturnTo } from "@/lib/oauth";
import { currentUser } from "@/lib/user";

/**
 * GET ?returnTo=/formly/fill?session=… → 302 to Google's consent screen (PKCE + single-use state).
 * ?details=1 (picker mode only) adds address, phone and birthday as an incremental second consent.
 */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  const origin = originOf(req);
  const params = new URL(req.url).searchParams;
  const returnTo = safeReturnTo(params.get("returnTo"));
  const back = (error: string) => {
    const url = new URL(returnTo, origin);
    url.searchParams.set("connect_error", error);
    return Response.redirect(url, 302);
  };
  if (!googleConfigured()) return back("Google sign-in isn't set up on this server");
  if (!oauthRedirectAllowed(origin)) return back("Google sign-in only works on localhost or an https address.");

  const { state, challenge } = newState(user, "google", returnTo);
  const secure = origin.startsWith("https:") ? "; Secure" : "";
  const details = googleAccess() === "picker" && params.get("details") === "1";
  return new Response(null, {
    status: 302,
    headers: {
      Location: googleAuthUrl(origin, state, challenge, { details }),
      "Set-Cookie": `${GOOGLE_STATE_COOKIE}=${state}; Path=/api/connectors/google; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
      "Cache-Control": "no-store",
    },
  });
}
