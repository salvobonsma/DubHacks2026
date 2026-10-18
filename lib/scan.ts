import { randomBytes } from "node:crypto";
import os from "node:os";
import { db } from "./db";

/** How long a phone link stays open after the desktop shows the QR code. */
export const SCAN_TTL_MS = 15 * 60 * 1000;
/** Per-scan caps, so one phone can't flood the twin with files. */
export const SCAN_MAX_FILES = 10;
export const SCAN_MAX_BYTES = 15 * 1024 * 1024;
/** Whole-request cap, checked from Content-Length before the multipart body is read into memory. */
export const SCAN_MAX_REQUEST_BYTES = SCAN_MAX_FILES * SCAN_MAX_BYTES + 1024 * 1024;

/** What a phone camera or document scanner produces; anything else (text, JSON, CSV, SVG) is refused. */
const SCAN_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif", "heic"],
  "application/pdf": ["pdf"],
};

/**
 * The MIME type to read a scanned file as, or null when it isn't a photo or PDF. The client's type and
 * extension must agree (a photo extension for an image type, .pdf for a PDF; phones sometimes send a
 * converted HEIC as image/jpeg under its old name). A file with no type is judged by its extension alone.
 */
export function scanFileType(name: string, mime: string): string | null {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const type = mime.toLowerCase().split(";")[0].trim();
  const byExt = Object.keys(SCAN_TYPES).find((t) => SCAN_TYPES[t].includes(ext));
  if (!type) return byExt ?? null;
  if (!SCAN_TYPES[type]) return null;
  if (!ext) return type;
  return byExt && byExt.startsWith("image/") === type.startsWith("image/") ? type : null;
}

// One row per QR code shown, owned by the visitor whose computer showed it (user_id). claimed_at is set
// when the phone starts sending (single use); received_at once its files are in sources and the twin is rebuilt.
db.exec(`
    CREATE TABLE IF NOT EXISTS scan_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      received_at INTEGER,
      files INTEGER NOT NULL DEFAULT 0
    );
`);
// Added later: why the twin rebuild failed after a scan, so the desktop doesn't claim it updated; and the
// owner, for a table made before per-visitor isolation (old rows get "", which matches no visitor).
const scanColumns = (db.prepare("PRAGMA table_info(scan_tokens)").all() as { name: string }[]).map((c) => c.name);
if (!scanColumns.includes("twin_error")) db.exec("ALTER TABLE scan_tokens ADD COLUMN twin_error TEXT");
if (!scanColumns.includes("user_id")) db.exec("ALTER TABLE scan_tokens ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");

interface ScanRow {
  token: string;
  user_id: string;
  created_at: number;
  claimed_at: number | null;
  received_at: number | null;
  files: number;
  twin_error: string | null;
}

export type ScanState = "waiting" | "receiving" | "received" | "expired" | "missing";

export function newScanToken(userId: string): string {
  // Drop stale rows while we're here; nothing reads them after the TTL.
  db.prepare("DELETE FROM scan_tokens WHERE created_at < ?").run(Date.now() - 24 * 60 * 60 * 1000);
  const token = randomBytes(16).toString("base64url");
  db.prepare("INSERT INTO scan_tokens (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, Date.now());
  return token;
}

/**
 * Whose sources a scan lands in: the visitor who showed the QR code, never the phone's own cookie
 * (the phone is a different browser with its own formly_uid). Null for an unknown token.
 */
export function scanOwner(token: string): string | null {
  const row = db.prepare("SELECT user_id FROM scan_tokens WHERE token = ?").get(token) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

/** Where a token is in its life. Received tokens stay readable after the TTL so the desktop can finish. */
export function scanState(token: string): { state: ScanState; files: number; twinError?: string } {
  const row = db.prepare("SELECT * FROM scan_tokens WHERE token = ?").get(token) as ScanRow | undefined;
  if (!row) return { state: "missing", files: 0 };
  if (row.received_at) return { state: "received", files: row.files, ...(row.twin_error ? { twinError: row.twin_error } : {}) };
  if (row.claimed_at) return { state: "receiving", files: 0 };
  if (Date.now() - row.created_at > SCAN_TTL_MS) return { state: "expired", files: 0 };
  return { state: "waiting", files: 0 };
}

/** Atomically takes an open, unexpired token for one upload. False if it's used, expired or unknown. */
export function claimScan(token: string): boolean {
  const res = db
    .prepare("UPDATE scan_tokens SET claimed_at = ? WHERE token = ? AND claimed_at IS NULL AND created_at >= ?")
    .run(Date.now(), token, Date.now() - SCAN_TTL_MS);
  return res.changes === 1;
}

/** Gives a claimed token back when nothing could be read, so the phone can try again. */
export function releaseScan(token: string) {
  db.prepare("UPDATE scan_tokens SET claimed_at = NULL WHERE token = ? AND received_at IS NULL").run(token);
}

export function finishScan(token: string, files: number, twinError?: string) {
  db.prepare("UPDATE scan_tokens SET received_at = ?, files = ?, twin_error = ? WHERE token = ?").run(
    Date.now(),
    files,
    twinError ?? null,
    token,
  );
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** First non-internal IPv4 address, i.e. this machine on the Wi-Fi a phone would share. */
function lanIp(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

function requestOrigin(req: Request): URL {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0];
  return new URL(`${proto ? `${proto}:` : url.protocol}//${host ?? url.host}`);
}

/** LAN origin (same port) when the request came from localhost, else null. */
export function lanOrigin(req: Request): string | null {
  const origin = requestOrigin(req);
  if (!LOCAL_HOSTS.has(origin.hostname)) return null;
  const ip = lanIp();
  return ip ? `${origin.protocol}//${ip}${origin.port ? `:${origin.port}` : ""}` : null;
}

/** Origin a phone can open: PUBLIC_ORIGIN, else the LAN IP when on localhost, else the request's own. */
export function scanOrigin(req: Request): string {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, "");
  return lanOrigin(req) ?? requestOrigin(req).origin;
}

export function scanUrl(req: Request, token: string): string {
  return `${scanOrigin(req)}/formly/scan/${token}`;
}
