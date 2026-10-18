import { db } from "@/lib/db";
import { revokeGoogleToken } from "@/lib/google";
import { usersWithRows, wipeSince } from "@/lib/user";

/**
 * The /race page's state. One global row (not per visitor: the laptop, Judge A and Judge B all see the same
 * race). It has no user_id column, so "End and wipe" and the TTL purge never touch it.
 *
 * wipe_since is the start of the oldest race not yet wiped, so "New race" twice and then "End and wipe" still
 * deletes every judge from all of those races.
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS race_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      started_at INTEGER,
      a_stopped_at INTEGER,
      b_finished_at INTEGER,
      b_fields INTEGER,
      b_total INTEGER,
      b_typed INTEGER,
      wipe_since INTEGER
    );
    INSERT OR IGNORE INTO race_state (id) VALUES (1);
`);

export interface RaceState {
  startedAt: number | null;
  aStoppedAt: number | null;
  bFinishedAt: number | null;
  /** Fields Formly filled on Judge B's form, of the total shown on the race path, and how many B typed. */
  bFields: number | null;
  bTotal: number | null;
  bTyped: number | null;
  wipeSince: number | null;
}

interface Row {
  started_at: number | null;
  a_stopped_at: number | null;
  b_finished_at: number | null;
  b_fields: number | null;
  b_total: number | null;
  b_typed: number | null;
  wipe_since: number | null;
}

export function getRace(): RaceState {
  const r = db.prepare("SELECT * FROM race_state WHERE id = 1").get() as Row;
  return {
    startedAt: r.started_at,
    aStoppedAt: r.a_stopped_at,
    bFinishedAt: r.b_finished_at,
    bFields: r.b_fields,
    bTotal: r.b_total,
    bTyped: r.b_typed,
    wipeSince: r.wipe_since,
  };
}

/** Both clocks start now. Earlier un-wiped races stay in wipe_since. */
export function startRace(now = Date.now()) {
  db.prepare(
    `UPDATE race_state SET started_at = ?, a_stopped_at = NULL, b_finished_at = NULL, b_fields = NULL, b_total = NULL,
       b_typed = NULL, wipe_since = COALESCE(wipe_since, ?) WHERE id = 1`,
  ).run(now, now);
}

/** The laptop operator taps Stop when Judge A reaches the credit check. First tap wins. */
export function stopA(now = Date.now()): boolean {
  return (
    db
      .prepare("UPDATE race_state SET a_stopped_at = ? WHERE id = 1 AND started_at IS NOT NULL AND a_stopped_at IS NULL")
      .run(now).changes === 1
  );
}

/** /tmobile?race=1 reached the credit check. Recorded only while a race runs, and only the first time. */
export function finishB(fields: number, total: number, typed: number, now = Date.now()): boolean {
  return (
    db
      .prepare(
        `UPDATE race_state SET b_finished_at = ?, b_fields = ?, b_total = ?, b_typed = ?
         WHERE id = 1 AND started_at IS NOT NULL AND b_finished_at IS NULL`,
      )
      .run(now, fields, total, typed).changes === 1
  );
}

/** "New race": clear the clocks. Judges' data stays until "End and wipe" (or the TTL). */
export function resetRace() {
  db.prepare(
    "UPDATE race_state SET started_at = NULL, a_stopped_at = NULL, b_finished_at = NULL, b_fields = NULL, b_total = NULL, b_typed = NULL WHERE id = 1",
  ).run();
}

/**
 * "End and wipe": every judge who created anything since the oldest un-wiped race started loses all of their data
 * (sources, twin, sessions, grants, tokens, logins, scan tokens, bank items), through lib/user.ts wipeSince, which
 * covers every per-user table and removes bank items at Plaid. Their Google grants are revoked at Google first
 * (a deleted token can't be revoked later). Also stops the clocks.
 */
export async function wipeRace(): Promise<{ deleted: number; tables: Record<string, number>; revoked: number; since: number | null }> {
  const { wipeSince: raceSince, startedAt } = getRace();
  const since = raceSince ?? startedAt;
  if (since === null) return { deleted: 0, tables: {}, revoked: 0, since: null };

  const users = usersWithRows(since);
  let revoked = 0;
  if (users.length) {
    const tokens = db
      .prepare(`SELECT access_token, refresh_token FROM oauth_tokens WHERE provider = 'google' AND user_id IN (${users.map(() => "?").join(", ")})`)
      .all(...users) as { access_token: string | null; refresh_token: string | null }[];
    const results = await Promise.allSettled(
      tokens.map((t) => t.refresh_token ?? t.access_token).filter((t): t is string => !!t).map((t) => revokeGoogleToken(t)),
    );
    revoked = results.filter((r) => r.status === "fulfilled").length;
  }

  const { rows, tables } = wipeSince(since, { revoked: true });
  db.prepare(
    `UPDATE race_state SET started_at = NULL, a_stopped_at = NULL, b_finished_at = NULL, b_fields = NULL, b_total = NULL,
       b_typed = NULL, wipe_since = NULL WHERE id = 1`,
  ).run();
  return { deleted: rows, tables, revoked, since };
}
