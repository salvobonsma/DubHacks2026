import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __formlyDb?: Database.Database };

function open() {
  // Wait on locks instead of failing: `next build` opens this from several workers at once.
  const db = new Database(path.join(DATA_DIR, "formly.db"), { timeout: 15000 });
  db.pragma("journal_mode = WAL");
  return db;
}

let ready: Database.Database | undefined;

/**
 * Opened on first use, not at import: `next build` imports every route from several workers at once, and
 * opening a fresh database from all of them races and fails with "database is locked".
 */
function conn() {
  if (ready) return ready;
  ready = g.__formlyDb ?? (g.__formlyDb = open());
  migrate(ready);
  return ready;
}

export const db = new Proxy({} as Database.Database, {
  get(_, prop) {
    const d = conn();
    const v = Reflect.get(d, prop);
    return typeof v === "function" ? v.bind(d) : v;
  },
});

// Idempotent schema, re-run on every module load so new tables appear without restarting dev.
function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      connector TEXT NOT NULL,
      name TEXT NOT NULL,
      mime TEXT,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS twin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      markdown TEXT NOT NULL,
      critical_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fact_overrides (
      label TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      value TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grants (
      business TEXT NOT NULL,
      key TEXT NOT NULL,
      decision TEXT NOT NULL,
      PRIMARY KEY (business, key)
    );
    CREATE TABLE IF NOT EXISTS session_results (
      session_id TEXT PRIMARY KEY,
      values_json TEXT NOT NULL,
      completed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      business TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      origin TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL
    );
`);
}
