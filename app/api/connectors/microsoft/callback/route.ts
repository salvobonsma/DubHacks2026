import { connection } from "next/server";
import { connectMicrosoft, MICROSOFT_STATE_COOKIE } from "@/lib/microsoft";
import { originOf, safeReturnTo, takeState } from "@/lib/oauth";
import { currentUser } from "@/lib/user";

/**
 * Microsoft redirects here after consent: check state (single use, same browser), exchange the code, then
 * go straight back with ?connected=microsoft&syncing=1. The OneDrive + Outlook import runs from the page
 * (ConnectPanel's POST /api/connectors/microsoft) so the browser isn't left waiting on Microsoft's screen.
 */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  const origin = originOf(req);
  const params = new URL(req.url).searchParams;
  const state = params.get("state") ?? "";
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${MICROSOFT_STATE_COOKIE}=([^;]+)`))?.[1];
  const saved = takeState(state);
  const back = (result: Record<string, string>) => {
    const url = new URL(safeReturnTo(saved?.returnTo ?? null), origin);
    for (const k of ["connected", "connect_error", "syncing"]) url.searchParams.delete(k);
    for (const [k, v] of Object.entries(result)) url.searchParams.set(k, v);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        "Set-Cookie": `${MICROSOFT_STATE_COOKIE}=; Path=/api/connectors/microsoft; Max-Age=0; HttpOnly; SameSite=Lax`,
        "Cache-Control": "no-store",
      },
    });
  };

  // Same browser (state cookie) and same visitor (formly_uid), so the tokens land in the account that asked.
  if (!saved || saved.provider !== "microsoft" || cookie !== state || saved.userId !== user) {
    return back({ connect_error: "Microsoft sign-in expired or was started elsewhere. Try connecting again." });
  }
  const denied = params.get("error");
  if (denied) {
    return back({
      connect_error: denied === "access_denied" ? "Microsoft sign-in was cancelled." : `Microsoft sign-in failed (${denied}).`,
    });
  }
  const code = params.get("code");
  if (!code) return back({ connect_error: "Microsoft didn't return a sign-in code." });

  try {
    await connectMicrosoft(user, code, saved.verifier, origin);
  } catch (e) {
    return back({ connect_error: `Microsoft sign-in failed: ${(e as Error).message}` });
  }
  return back({ connected: "microsoft", syncing: "1" });
}
