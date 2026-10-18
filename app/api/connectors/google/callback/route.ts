import { connection } from "next/server";
import { exchangeGoogleCode, GOOGLE_STATE_COOKIE, googleConfigured } from "@/lib/google";
import { originOf, takeState } from "@/lib/oauth";
import { currentUser } from "@/lib/user";

/**
 * Google redirects here after consent: check state (single use, same browser), trade the code for
 * tokens, then send the user straight back with ?connected=google&syncing=1 (or ?connect_error=…).
 * The import itself (Gmail, Drive, transcription, twin rebuild) can take a minute, so ConnectPanel runs
 * it from the page under a progress label instead of leaving the browser spinning on Google's screen.
 * returnTo keeps the popup's ?session=, so the popup lands back on the same fill and runs it.
 */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  const origin = originOf(req);
  const params = new URL(req.url).searchParams;
  const state = params.get("state") ?? "";
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${GOOGLE_STATE_COOKIE}=([^;]+)`))?.[1];
  const pending = takeState(state);

  const back = (returnTo: string, result: { connected: true } | { error: string }) => {
    const url = new URL(returnTo, origin);
    url.searchParams.delete("connected");
    url.searchParams.delete("connect_error");
    url.searchParams.delete("syncing");
    if ("error" in result) url.searchParams.set("connect_error", result.error);
    else {
      url.searchParams.set("connected", "google");
      url.searchParams.set("syncing", "1");
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        "Set-Cookie": `${GOOGLE_STATE_COOKIE}=; Path=/api/connectors/google; Max-Age=0; HttpOnly; SameSite=Lax`,
        "Cache-Control": "no-store",
      },
    });
  };

  // Same browser (state cookie) and same visitor (formly_uid), so the tokens land in the account that asked.
  if (!pending || pending.provider !== "google" || cookie !== state || pending.userId !== user) {
    return back(pending?.returnTo ?? "/formly", { error: "Google sign-in expired or was started elsewhere. Try again." });
  }
  const { returnTo, verifier } = pending;
  if (params.get("error")) {
    const denied = params.get("error") === "access_denied";
    return back(returnTo, { error: denied ? "Google sign-in was cancelled" : `Google sign-in failed (${params.get("error")})` });
  }
  const code = params.get("code");
  if (!code || !googleConfigured()) return back(returnTo, { error: "Google sign-in failed (no code)" });

  try {
    await exchangeGoogleCode(user, code, verifier, origin);
  } catch (e) {
    return back(returnTo, { error: (e as Error).message });
  }
  // Tokens are saved; the page's POST /api/connectors/google does the sync.
  return back(returnTo, { connected: true });
}
