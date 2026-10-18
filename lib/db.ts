import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __formlyDb?: Database.Database };

function open() {
  const db = new Database(path.join(DATA_DIR, "formly.db"));
  db.pragma("journal_mode = WAL");
  return db;
}

export const db = g.__formlyDb ?? (g.__formlyDb = open());

// Deleted rows are zeroed, not just unlinked: sources hold ID numbers and imported vault data, and "Delete my data"
// must take them off the disk. Set outside open() so the connection kept across hot reloads gets it too.
db.pragma("secure_delete = ON");

/**
 * Push zeroed pages into formly.db and empty the WAL, which still holds every earlier version of a deleted row.
 * Call after deleting a user's data. Best effort: a busy checkpoint just leaves it to the next call or the timer.
 */
export function scrubDeleted(): void {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // A reader is mid-transaction; the timer below retries.
  }
}

// Every minute as well, so deletes made by any route (DELETE /api/sources, lib/user.ts wipeUser, the TTL purge)
// leave the WAL within a minute even when the caller doesn't scrub. Once per process; once now for older leftovers.
const t = globalThis as unknown as { __formlyScrub?: ReturnType<typeof setInterval> };
if (!t.__formlyScrub) {
  // Pages freed before secure_delete was on still hold old rows; VACUUM rewrites the file without them.
  try {
    if ((db.pragma("freelist_count", { simple: true }) as number) > 0) db.exec("VACUUM");
  } catch {
    // Busy at startup; nothing new is left behind now that deletes zero their pages.
  }
  scrubDeleted();
  t.__formlyScrub = setInterval(scrubDeleted, 60_000);
  t.__formlyScrub.unref?.();
}

/**
 * Every visitor's data is keyed by user_id (the formly_uid cookie, see lib/user.ts). Schema 2 added that
 * column to every per-user table. Migration: drop and recreate. These tables only ever held demo data and
 * every row expires after FORMLY_TTL_MINUTES anyway, so nothing worth keeping is lost; a fresh database
 * skips straight to the new schema. The OAuth, scan and login tables are listed here so they are dropped
 * in the same step; their modules recreate them.
 */
const SCHEMA_VERSION = 2;
if ((db.pragma("user_version", { simple: true }) as number) < SCHEMA_VERSION) {
  db.exec(`
    DROP TABLE IF EXISTS sources;
    DROP TABLE IF EXISTS twin;
    DROP TABLE IF EXISTS fact_overrides;
    DROP TABLE IF EXISTS grants;
    DROP TABLE IF EXISTS session_results;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS oauth_tokens;
    DROP TABLE IF EXISTS oauth_states;
    DROP TABLE IF EXISTS scan_tokens;
    DROP TABLE IF EXISTS logins;
  `);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

// Idempotent schema, re-run on every module load so new tables appear without restarting dev.
// sessions.user_id is null when an allowlisted merchant on another origin created it (no cookie);
// the Formly popup claims it for the visitor who opens it (lib/user.ts claimSession).
db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      connector TEXT NOT NULL,
      name TEXT NOT NULL,
      mime TEXT,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sources_user ON sources (user_id, created_at);
    CREATE TABLE IF NOT EXISTS twin (
      user_id TEXT PRIMARY KEY,
      markdown TEXT NOT NULL,
      critical_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fact_overrides (
      user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      action TEXT NOT NULL,
      value TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, label)
    );
    CREATE TABLE IF NOT EXISTS grants (
      user_id TEXT NOT NULL,
      business TEXT NOT NULL,
      key TEXT NOT NULL,
      decision TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, business, key)
    );
    CREATE TABLE IF NOT EXISTS session_results (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      values_json TEXT NOT NULL,
      completed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      business TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      origin TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL
    );
`);

// Additive column (idempotent): the field ids the user approved as Formly's suggestions, so the merchant page can
// mark them "Suggested by Formly" rather than "Filled by Formly". Null on rows written before it existed.
if (!(db.prepare("PRAGMA table_info(session_results)").all() as { name: string }[]).some((c) => c.name === "suggested_json")) {
  db.exec("ALTER TABLE session_results ADD COLUMN suggested_json TEXT");
}
