import crypto from "node:crypto";
import { db } from "./db";

export type OAuthProvider = "google" | "microsoft";

const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RETURN = "/formly";

/**
 * Token + pending-sign-in tables. Created here (not in lib/db.ts) so OAuth stays self-contained; lib/db.ts
 * only drops them during its schema-2 migration. Both are per visitor (user_id = the formly_uid cookie).
 */
export function oauthTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      account TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      scopes TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider)
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT,
      return_to TEXT,
      verifier TEXT,
      created_at INTEGER
    );
  `);
}
oauthTables();

/** Upsert a provider's tokens. Refresh responses usually omit refresh_token, so the old one is kept. */
export function saveTokens(
  userId: string,
  provider: OAuthProvider,
  t: { account: string; access_token: string; refresh_token?: string; expires_in: number; scopes: string },
): void {
  db.prepare(
    `INSERT INTO oauth_tokens (user_id, provider, account, access_token, refresh_token, expires_at, scopes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET account = excluded.account, access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
       expires_at = excluded.expires_at, scopes = excluded.scopes`,
  ).run(userId, provider, t.account, t.access_token, t.refresh_token ?? null, Date.now() + t.expires_in * 1000, t.scopes, Date.now());
}

/**
 * A refresh: overwrite the tokens of a grant that still exists, never insert. If the user deleted their data
 * (or disconnected) while the refresh was in flight, the grant stays gone. Returns false then.
 */
export function updateTokens(
  userId: string,
  provider: OAuthProvider,
  t: { access_token: string; refresh_token?: string; expires_in: number; scopes: string },
): boolean {
  return (
    db
      .prepare(
        `UPDATE oauth_tokens SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ?, scopes = ?
         WHERE user_id = ? AND provider = ?`,
      )
      .run(t.access_token, t.refresh_token ?? null, Date.now() + t.expires_in * 1000, t.scopes, userId, provider).changes === 1
  );
}

export function getTokens(
  userId: string,
  provider: OAuthProvider,
): { account: string; access_token: string; refresh_token: string | null; expires_at: number; scopes: string } | null {
  const row = db.prepare("SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ?").get(userId, provider) as
    | { account: string | null; access_token: string; refresh_token: string | null; expires_at: number; scopes: string | null }
    | undefined;
  if (!row) return null;
  return {
    account: row.account ?? "",
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
    scopes: row.scopes ?? "",
  };
}

export function deleteTokens(userId: string, provider: OAuthProvider): void {
  db.prepare("DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?").run(userId, provider);
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/**
 * Start a sign-in: a random CSRF state plus a PKCE (S256) verifier/challenge pair.
 * The row is single use (takeState deletes it) and expires after 10 minutes.
 */
export function newState(
  userId: string,
  provider: OAuthProvider,
  returnTo: string,
): { state: string; verifier: string; challenge: string } {
  const state = b64url(crypto.randomBytes(32));
  const verifier = b64url(crypto.randomBytes(48)); // 64 chars, inside PKCE's 43-128 range
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const now = Date.now();
  db.prepare("DELETE FROM oauth_states WHERE created_at < ?").run(now - STATE_TTL_MS);
  db.prepare("INSERT INTO oauth_states (state, user_id, provider, return_to, verifier, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    state,
    userId,
    provider,
    safeReturnTo(returnTo),
    verifier,
    now,
  );
  return { state, verifier, challenge };
}

/**
 * Consume a state from the callback. Always deletes the row; null when unknown or expired. userId is the
 * visitor who started the sign-in: the callback only accepts it from that same visitor, so tokens always
 * land in the account of the browser that asked for them.
 */
export function takeState(state: string): { provider: string; returnTo: string; verifier: string; userId: string } | null {
  if (!state) return null;
  const row = db.prepare("DELETE FROM oauth_states WHERE state = ? RETURNING *").get(state) as
    | { provider: string; return_to: string; verifier: string; created_at: number; user_id: string }
    | undefined;
  if (!row || Date.now() - row.created_at > STATE_TTL_MS) return null;
  return { provider: row.provider, returnTo: safeReturnTo(row.return_to), verifier: row.verifier, userId: row.user_id };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Origin for OAuth redirect URIs. A request that came in on localhost keeps its own origin
 * (http://localhost:3000), even when PUBLIC_ORIGIN is set: Google and Microsoft accept plain-http
 * localhost redirects, and the callback has to land on the origin whose cookies started the sign-in.
 * Anywhere else PUBLIC_ORIGIN wins (a reverse proxy may report http or an internal host), else the host
 * the browser actually used. Never the LAN IP: providers refuse http://192.168.x.x redirects.
 */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(/:$/, "");
  const own = `${proto}://${host}`;
  let local = false;
  try {
    local = LOOPBACK.has(new URL(own).hostname);
  } catch {}
  const fixed = process.env.PUBLIC_ORIGIN?.trim();
  if (fixed && !local) return fixed.replace(/\/+$/, "");
  return own;
}

/**
 * Whether Google / Microsoft will accept a redirect URI on this origin: https anywhere, plain http only on
 * localhost. A phone on the LAN (http://192.168.x.x:3000) would land on the provider's error page, so
 * there the UI keeps the demo sign-in instead of sending it to a consent screen that can't come back.
 */
export function oauthRedirectAllowed(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" || LOOPBACK.has(url.hostname);
  } catch {
    return false;
  }
}

/** Only same-site relative paths ("/formly/fill?session=…"); anything else (//evil.com, https://…) becomes "/formly". */
export function safeReturnTo(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f]/.test(path)) return DEFAULT_RETURN;
  try {
    const base = "http://formly.invalid";
    const url = new URL(path, base);
    if (url.origin !== base) return DEFAULT_RETURN;
    // Check the normalized result too: dot segments ("/a/..//evil.com", "/%2e//evil.com") collapse
    // into a protocol-relative "//evil.com" that a later new URL(out, origin) would follow off-site.
    const out = url.pathname + url.search + url.hash;
    if (out.startsWith("//") || out.startsWith("/\\")) return DEFAULT_RETURN;
    return out;
  } catch {
    return DEFAULT_RETURN;
  }
}
