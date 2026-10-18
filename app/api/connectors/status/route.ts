import { connection } from "next/server";
import { googleAccess, googleConfigured, googleConnection, googleDetailsGranted, pickerConfigured } from "@/lib/google";
import { microsoftConfigured, microsoftConnection } from "@/lib/microsoft";
import { oauthRedirectAllowed, originOf } from "@/lib/oauth";
import { loginCount } from "@/lib/passwordManager";
import { lanOrigin } from "@/lib/scan";
import { currentUser, ttlLabel, ttlMinutes } from "@/lib/user";

/**
 * Which connectors are live for this visitor (real OAuth credentials set, and an origin the provider will
 * redirect back to) or off, and whether each is connected for them. There is no demo mode here: when
 * Google isn't set up the UI hides it (the sample-data persona is only on /demo).
 * google.access: "full" (Gmail + Drive search) or "picker" (Drive files the user picks, Gmail off).
 * google.details: picker mode only, whether address, phone and birthday were granted.
 * scan.lanUrl is this machine's Wi-Fi origin when the request came from localhost. ttl: auto-delete window.
 * passwords.logins: how many saved logins (Apple Passwords / Chrome import) this visitor has, never the logins.
 */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  // Live only where the provider accepts our redirect URI (https or localhost).
  const redirectOk = oauthRedirectAllowed(originOf(req));
  const googleLive = googleConfigured() && redirectOk;
  const g = googleLive ? googleConnection(user) : null;
  const access = googleAccess();
  const details = !!g && googleDetailsGranted(user);

  const msLive = microsoftConfigured() && redirectOk;
  const ms = msLive ? microsoftConnection(user) : null;

  return Response.json(
    {
      google: googleLive
        ? {
            mode: "live",
            access,
            picker: access === "picker" && pickerConfigured(),
            connected: !!g,
            ...(g ? { email: g.email } : {}),
            ...(access === "picker" ? { details } : {}),
          }
        : { mode: "off", access, picker: false, connected: false },
      microsoft: msLive
        ? { mode: "live", connected: !!ms, ...(ms ? { email: ms.email } : {}) }
        : { mode: "off", connected: false },
      scan: { lanUrl: lanOrigin(req) },
      passwords: { logins: loginCount(user) },
      ttl: { minutes: ttlMinutes(), label: ttlLabel() },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
