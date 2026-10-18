import crypto from "node:crypto";
import { db } from "./db";
import { revokeGoogleToken } from "./google";
import { removePlaidItems } from "./plaid";
import { markWiped } from "./wipes";

/**
 * Per-visitor isolation. Every visitor gets a random 128-bit id in the httpOnly formly_uid cookie (set by
 * proxy.ts on their first request), and every per-user row carries it as user_id. The Formly popup,
 * /formly and the merchant pages share one origin, so they share the cookie.
 */
export const UID_COOKIE = "formly_uid";
/** Set by proxy.ts (and stripped from incoming requests) when it minted the cookie on this very request. */
export const UID_FRESH_HEADER = "x-formly-uid-fresh";
export const UID_PATTERN = /^[a-f0-9]{32}$/;

export function newUserId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function cookieValue(req: Request, name: string): string | undefined {
  return req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

/**
 * The visitor making this request. proxy.ts guarantees the cookie, so the fallback (a throwaway id that
 * owns nothing) only covers a request the proxy didn't see. Also runs the TTL purge, so expired data is
 * gone before any route reads it.
 */
export function currentUser(req: Request): string {
  purgeExpired();
  const id = cookieValue(req, UID_COOKIE);
  return id && UID_PATTERN.test(id) ? id : newUserId();
}

/** True when this request arrived without a cookie (e.g. a cross-origin merchant page). */
export function isFreshUser(req: Request): boolean {
  return req.headers.get(UID_FRESH_HEADER) === "1";
}

export function ttlMinutes(): number {
  const n = Number(process.env.FORMLY_TTL_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

/** "1 hour", "90 minutes": for "Your data is deleted automatically after …". */
export function ttlLabel(minutes = ttlMinutes()): string {
  if (minutes % 60 === 0) return minutes === 60 ? "1 hour" : `${minutes / 60} hours`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** Per-user tables and the column that says when each row was made. Tables a module hasn't created yet are skipped. */
const USER_TABLES: [table: string, created: string][] = [
  ["sources", "created_at"],
  ["twin", "created_at"],
  ["fact_overrides", "created_at"],
  ["grants", "created_at"],
  ["session_results", "completed_at"],
  ["sessions", "created_at"],
  ["oauth_tokens", "created_at"],
  ["oauth_states", "created_at"],
  ["scan_tokens", "created_at"],
  ["logins", "created_at"],
  ["plaid_items", "created_at"],
];

/**
 * The per-user tables that exist and already carry user_id. A table made by an older module version
 * (before its own migration has run in this process) is skipped instead of failing every request.
 */
function existingTables(): [string, string][] {
  const names = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name),
  );
  return USER_TABLES.filter(([t, created]) => {
    if (!names.has(t)) return false;
    const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    return cols.includes("user_id") && cols.includes(created);
  });
}

/** Users with any row created in [from, to). */
export function usersWithRows(from: number, to: number = Number.MAX_SAFE_INTEGER): string[] {
  const tables = existingTables();
  if (!tables.length) return [];
  const sql = tables
    .map(([t, c]) => `SELECT user_id FROM ${t} WHERE user_id IS NOT NULL AND ${c} >= ? AND ${c} < ?`)
    .join(" UNION ");
  const args = tables.flatMap(() => [from, to]);
  return (db.prepare(sql).all(...args) as { user_id: string }[]).map((r) => r.user_id);
}

/**
 * Delete every row a user owns, in every per-user table, and revoke their Google grant at Google
 * (best effort, in the background; pass revoked: true when the caller already awaited it). Returns how
 * many rows were deleted.
 */
export function wipeUser(userId: string, opts: { revoked?: boolean } = {}): number {
  const google = db.prepare("SELECT access_token, refresh_token FROM oauth_tokens WHERE user_id = ? AND provider = 'google'").get(
    userId,
  ) as { access_token: string | null; refresh_token: string | null } | undefined;
  const tables = existingTables();
  let deleted = 0;
  // Before the delete: an import that finishes in between sees the marker and drops its rows.
  markWiped(userId);
  // Reads the bank tokens now (before the delete), then calls Plaid's /item/remove in the background.
  void removePlaidItems(userId);
  db.transaction(() => {
    // Results of this user's sessions first, while the sessions still say who owns them.
    if (tables.some(([t]) => t === "sessions")) {
      deleted += db
        .prepare("DELETE FROM session_results WHERE user_id = ? OR session_id IN (SELECT id FROM sessions WHERE user_id = ?)")
        .run(userId, userId).changes;
    }
    for (const [t] of tables) deleted += db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId).changes;
  })();
  const token = google?.refresh_token ?? google?.access_token;
  if (token && !opts.revoked) void revokeGoogleToken(token);
  return deleted;
}

let lastPurge = 0;

/**
 * TTL auto-delete: once any of a visitor's rows is older than FORMLY_TTL_MINUTES, all of their data goes
 * (a twin can't outlive the sources it was built from). Runs on every request through currentUser (at most
 * once a second) and on a 5-minute timer. Returns the number of rows deleted.
 */
export function purgeExpired(now = Date.now()): number {
  if (now - lastPurge < 1000) return 0;
  lastPurge = now;
  const cutoff = now - ttlMinutes() * 60_000;
  let deleted = 0;
  for (const uid of usersWithRows(0, cutoff)) deleted += wipeUser(uid);
  // Rows the merchant created without a cookie and nobody claimed.
  deleted += db.prepare("DELETE FROM sessions WHERE user_id IS NULL AND created_at < ?").run(cutoff).changes;
  return deleted;
}

/**
 * The race page's "End and wipe": every visitor who created anything since `since` loses all of it, through
 * wipeUser (so Plaid items are removed at Plaid too). Returns the rows deleted per table.
 */
export function wipeSince(since: number, opts: { revoked?: boolean } = {}): { users: number; rows: number; tables: Record<string, number> } {
  const users = usersWithRows(since);
  const tables: Record<string, number> = {};
  if (users.length) {
    const marks = users.map(() => "?").join(", ");
    for (const [t] of existingTables()) {
      const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id IN (${marks})`).get(...users) as { n: number }).n;
      if (n) tables[t] = n;
    }
  }
  let rows = 0;
  for (const uid of users) rows += wipeUser(uid, opts);
  // Sessions a merchant on another origin made without a cookie during the race, never claimed.
  const unowned = db.prepare("DELETE FROM sessions WHERE user_id IS NULL AND created_at >= ?").run(since).changes;
  if (unowned) tables.sessions = (tables.sessions ?? 0) + unowned;
  return { users: users.length, rows: rows + unowned, tables };
}

/** When this visitor's data auto-deletes: TTL after their oldest row, or null when they have none. */
export function expiresAt(userId: string): number | null {
  const tables = existingTables();
  const sql = tables.map(([t, c]) => `SELECT MIN(${c}) AS t FROM ${t} WHERE user_id = ?`).join(" UNION ALL ");
  const rows = db.prepare(`SELECT MIN(t) AS t FROM (${sql})`).get(...tables.map(() => userId)) as { t: number | null };
  return rows.t ? rows.t + ttlMinutes() * 60_000 : null;
}

/**
 * A fill session is usable only by the visitor who owns it. Read-only: an unowned session (made by an
 * allowlisted merchant on another origin, see app/api/sessions) is only taken by claimSession.
 */
export function ownSession(sessionId: string, userId: string): boolean {
  const row = db.prepare("SELECT user_id FROM sessions WHERE id = ?").get(sessionId) as { user_id: string | null } | undefined;
  return !!row && row.user_id === userId;
}

/**
 * The answers a visitor approved for one of their own sessions: values plus the ids that were Formly's
 * suggestions. Null when the session isn't theirs or nothing was approved yet.
 */
export function sessionResult(sessionId: string, userId: string): { values: Record<string, string>; suggested: string[] } | null {
  if (!ownSession(sessionId, userId)) return null;
  const row = db.prepare("SELECT values_json, suggested_json FROM session_results WHERE session_id = ? AND user_id = ?").get(
    sessionId,
    userId,
  ) as { values_json: string; suggested_json: string | null } | undefined;
  if (!row) return null;
  return { values: JSON.parse(row.values_json), suggested: row.suggested_json ? JSON.parse(row.suggested_json) : [] };
}

/**
 * The Formly popup takes an unowned session for its visitor (an explicit same-origin PATCH, never a GET, so a
 * link preview or an <img> can't take it first). No-op when someone already owns it. Returns ownSession.
 */
export function claimSession(sessionId: string, userId: string): boolean {
  db.prepare("UPDATE sessions SET user_id = ? WHERE id = ? AND user_id IS NULL").run(userId, sessionId);
  return ownSession(sessionId, userId);
}

// Timer half of the purge. Replaced on hot reload so dev doesn't stack intervals.
const timers = globalThis as unknown as { __formlyPurgeTimer?: ReturnType<typeof setInterval> };
if (timers.__formlyPurgeTimer) clearInterval(timers.__formlyPurgeTimer);
timers.__formlyPurgeTimer = setInterval(() => {
  try {
    lastPurge = 0;
    purgeExpired();
  } catch (e) {
    console.warn(`[formly] purge failed: ${(e as Error).message}`);
  }
}, 5 * 60_000);
timers.__formlyPurgeTimer.unref?.();
