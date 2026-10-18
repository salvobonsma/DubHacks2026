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

// Idempotent schema, re-run on every module load so new tables appear without restarting dev.
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
