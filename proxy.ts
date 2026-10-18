import { NextResponse, type NextRequest } from "next/server";

// Kept in sync with lib/user.ts (not imported: that module opens the database, which the proxy never needs).
const UID_COOKIE = "formly_uid";
const UID_FRESH_HEADER = "x-formly-uid-fresh";
const UID_PATTERN = /^[a-f0-9]{32}$/;
const ONE_YEAR = 365 * 24 * 60 * 60;

/**
 * Gives every visitor an anonymous id (random 128 bits, httpOnly formly_uid cookie) on their first request,
 * so each judge's sources, twin, grants and sessions stay theirs. A new id is also written into this
 * request's own Cookie header, so the route handler on the very first request already sees it.
 */
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  // Only the proxy may say an id is fresh; drop any copy the client sent.
  headers.delete(UID_FRESH_HEADER);
  const existing = req.cookies.get(UID_COOKIE)?.value;
  if (existing && UID_PATTERN.test(existing)) return NextResponse.next({ request: { headers } });

  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const others = (req.headers.get("cookie") ?? "")
    .split(/;\s*/)
    .filter((c) => c && !c.startsWith(`${UID_COOKIE}=`));
  headers.set("cookie", [...others, `${UID_COOKIE}=${id}`].join("; "));
  headers.set(UID_FRESH_HEADER, "1");

  const res = NextResponse.next({ request: { headers } });
  const https = (req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.replace(/:$/, "")) === "https";
  res.cookies.set(UID_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: https, path: "/", maxAge: ONE_YEAR });
  return res;
}

export const config = {
  // Everything but build assets, static files and the password-manager import: the proxy buffers request bodies up to
  // 10 MB (proxyClientMaxBodySize), which would cut a 20 MB export, and that route needs the cookie the page load set.
  matcher: ["/((?!api/connectors/password-manager|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf|otf|css|js|map)$).*)"],
};
