import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { nanoid } from "nanoid";
import { db, scrubDeleted } from "./db";
import type { FormField } from "./types";
import { wipedSince } from "./wipes";

/**
 * Password-manager import, parsed in memory only (the upload is never written to disk, never logged, and the raw
 * export never goes to Gemini).
 *
 * - 1Password (.1pux) and Bitwarden (.json, or a .csv that holds cards / identities): identities, payment cards,
 *   driver's licenses, passports, SSNs and bank accounts become one labelled source (connector "password-manager").
 *   Card, bank account and Social Security numbers appear as their last 4 only; a card's full number is kept
 *   encrypted in `vault_cards` for cardFill. Logins, passwords, TOTP secrets, PINs, CVVs, concealed fields, notes
 *   and URLs are skipped.
 * - Apple Passwords and Google Password Manager / Chrome (.csv): each login goes into the local `logins` table with
 *   its password (and OTP secret) encrypted with AES-256-GCM. Only a non-secret summary (which emails / usernames
 *   the user signs in with, and on which sites) becomes a source (connector "passwords").
 */

export const MAX_BYTES = 20 * 1024 * 1024;

// Per visitor like every other table (lib/user.ts USER_TABLES purges it on TTL, Delete my data and End and wipe).
db.exec(`
  CREATE TABLE IF NOT EXISTS logins (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    site TEXT NOT NULL,
    url TEXT,
    username TEXT,
    password_enc TEXT,
    otp_enc TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS logins_user ON logins (user_id, created_at);
`);

// Full payment card numbers from a 1Password / Bitwarden import, encrypted like logins. The source text only says
// "ending 4242". Tied to that source by a trigger: whatever deletes the password-manager source (a re-import,
// Delete on /formly, DELETE /api/sources, lib/user.ts wipeUser for Delete my data / End and wipe / the TTL purge)
// deletes the card numbers in the same statement, so they can't outlive it.
db.exec(`
  CREATE TABLE IF NOT EXISTS vault_cards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL,
    last4 TEXT NOT NULL,
    number_enc TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS vault_cards_user ON vault_cards (user_id, created_at);
  CREATE TRIGGER IF NOT EXISTS vault_cards_follow_source AFTER DELETE ON sources
  WHEN OLD.connector = 'password-manager'
  BEGIN
    DELETE FROM vault_cards WHERE user_id = OLD.user_id;
  END;
`);

/** A clear, user-facing reason an export can't be imported (400, never a 500). */
export class ImportError extends Error {}

export type Manager = "1password" | "bitwarden" | "apple" | "chrome";
export const MANAGER_NAMES: Record<Manager, string> = {
  "1password": "1Password",
  bitwarden: "Bitwarden",
  apple: "Apple Passwords",
  chrome: "Google Password Manager",
};

export type Parsed =
  | { kind: "vault"; manager: "1password" | "bitwarden"; name: string; text: string; items: number; cards: CardSecret[] }
  | { kind: "logins"; manager: "apple" | "chrome"; logins: LoginRow[] };

/** A payment card's full number, held encrypted for the fill (cardFill); the source text only says "ending 4242". */
export interface CardSecret {
  label: string;
  number: string;
}

export interface LoginRow {
  site: string;
  url: string | null;
  username: string | null;
  password: string;
  otp: string | null;
}

// ---------- detection ----------

const CHROME_HEADER = ["name", "url", "username", "password"];
const APPLE_HEADER = ["title", "url", "username", "password"];
const BITWARDEN_CSV = ["type", "name", "login_uri"];

/** A CSV column or JSON key that holds a secret, whichever manager (Firefox, KeePass, Dashlane, …) wrote the file. */
const SECRET_KEY = /^(password|passwd|login_password|totp|otp|otpauth|login_totp)$/i;

/**
 * True when this file is a password-manager export, so the generic upload (whose text goes to Gemini) refuses it
 * and points at the password-manager import instead. Reads the whole file, not a head: a Bitwarden vault with many
 * folders puts "items" far past the first few KB. Zips are checked entry by entry.
 */
export function isPasswordExport(name: string, data: Buffer, depth = 0): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "1pux") return true;
  if (data.subarray(0, 4).equals(ZIP_MAGIC)) return depth < 2 && zipHasPasswordExport(data, depth);
  const text = data.toString("utf8").replace(/^﻿/, "");
  const start = text.trimStart();
  if (/^<\?xml[\s\S]{0,200}<KeePassFile|^<KeePassFile/.test(start)) return true;
  if (ext === "json" || start.startsWith("{") || start.startsWith("[")) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // Not valid JSON: still refuse anything that reads like a vault (a truncated or hand-edited export).
      return /"(password|totp|login_password)"\s*:\s*"[^"]/i.test(text) || /"encKeyValidation_DO_NOT_EDIT"/.test(text);
    }
    if (isVaultJson(json)) return true;
  }
  // A CSV header with a password / OTP column is a login export, Firefox's url,username,password,… included.
  if (ext === "csv" || ext === "tsv" || /^[^\n]*[,\t;][^\n]*\n/.test(text)) {
    const first = text.split(/\r?\n/, 1)[0] ?? "";
    const cols = (first.includes("\t") && !first.includes(",") ? first.split("\t") : first.includes(";") && !first.includes(",") ? first.split(";") : splitCsvLine(first))
      .map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase());
    const has = (want: string[]) => want.every((w) => cols.includes(w));
    if (cols.some((c) => SECRET_KEY.test(c)) || has(BITWARDEN_CSV)) return true;
  }
  return false;
}

/**
 * Bitwarden ({encrypted, folders, items: [{type, login}]} or an encrypted export's key check), a 1Password
 * export.data ({accounts: [{vaults}]}), or any JSON carrying a password / TOTP value somewhere in it.
 */
function isVaultJson(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const o = json as Record<string, unknown>;
  if (!Array.isArray(json)) {
    if ("encrypted" in o || "passwordProtected" in o || "encKeyValidation_DO_NOT_EDIT" in o) return true;
    if (Array.isArray(o.folders) && ("items" in o || "collections" in o)) return true;
    if (Array.isArray(o.items) && o.items.some((i) => i && typeof i === "object" && ("login" in i || typeof (i as { type?: unknown }).type === "number"))) {
      return true;
    }
    if (Array.isArray(o.accounts) && o.accounts.some((a) => a && typeof a === "object" && "vaults" in a)) return true;
  }
  // Any other shape: a string value under a password / TOTP key anywhere (bounded walk).
  let budget = 200_000;
  const walk = (v: unknown): boolean => {
    if (--budget < 0 || !v || typeof v !== "object") return false;
    if (Array.isArray(v)) return v.some(walk);
    return Object.entries(v).some(([k, x]) => (SECRET_KEY.test(k) && typeof x === "string" && x !== "") || walk(x));
  };
  return walk(json);
}

/** A zip holding a 1Password export.data, a .1pux, or any entry that is itself a password export. */
function zipHasPasswordExport(zip: Buffer, depth: number): boolean {
  let entries: string[];
  try {
    entries = zipEntryNames(zip);
  } catch {
    return false;
  }
  if (entries.some((n) => n === "export.data" || /\.1pux$/i.test(n))) return true;
  // Only entries an upload could read as text (and nested zips), 50 at most, so a zip bomb can't run away.
  const readable = entries.filter((n) => !n.startsWith("__MACOSX/") && /\.(csv|tsv|json|txt|md|xml|zip)$/i.test(n)).slice(0, 50);
  for (const n of readable) {
    try {
      const body = unzipEntry(zip, n);
      if (body && isPasswordExport(n, body, depth + 1)) return true;
    } catch {
      // An entry Formly can't inflate isn't read by anything else either.
    }
  }
  return false;
}

/** Parse any supported export. Throws ImportError with a message the UI shows as-is. */
export function parseExport(name: string, data: Buffer): Parsed {
  if (data.length > MAX_BYTES) throw new ImportError("That file is over 20 MB. Export without attachments and try again.");
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  // A zip (PK\x03\x04) is a 1Password export whatever it's called.
  if (ext === "1pux" || data.subarray(0, 4).equals(ZIP_MAGIC)) return parse1pux(data);
  const text = data.toString("utf8").replace(/^﻿/, "");
  if (ext === "json" || text.trimStart().startsWith("{")) return parseBitwardenJson(text);
  if (ext === "csv" || text.includes(",")) return parseCsv(text);
  throw new ImportError(
    "Formly can't read that file. Use a 1Password .1pux, a Bitwarden .json, or an Apple Passwords or Chrome .csv export.",
  );
}

// ---------- 1Password (.1pux) ----------

/** 1Password category ids worth having on a form. Logins (001), notes (003), passwords (005) and the rest are skipped. */
const OP_CATEGORIES: Record<string, string> = {
  "002": "Credit Card",
  "004": "Identity",
  "101": "Bank Account",
  "103": "Driver License",
  "106": "Passport",
  "108": "Social Security Number",
};

/** Says what a bare field label ("number", "expiry date") belongs to, so the twin can't mix a passport and a license up. */
const OP_PREFIX: Record<string, string> = {
  "Credit Card": "card",
  "Bank Account": "bank account",
  "Driver License": "driver's license",
  Passport: "passport",
  "Social Security Number": "Social Security",
};

/**
 * Field ids / titles never imported, even inside a kept item: PINs, CVVs, passwords, one-time codes, security
 * answers. No word boundary after the word, so "CVV2" and "PIN code" match; one before it, so "spin" doesn't.
 */
const SECRET_FIELD =
  /(^|[^a-z])(pins?|cvv|cvc|csc|cid|security (code|question|answer)|answer|verification|password|passcode|passphrase|passwd|otp|totp|one-time|secret|recovery|private key|api key|token|credential)(?![a-z])/i;

/**
 * 1Password field kinds read as plain facts. Everything else is dropped: concealed (passwords, PINs, CVVs, security
 * answers under any title), creditCardNumber (masked, see below), totp, url, sshKey, file, reference.
 */
const OP_PLAIN_KINDS = new Set(["string", "date", "monthYear", "email", "address", "phone", "gender", "menu", "creditCardType"]);

/** Concealed fields 1Password uses for a kept fact, by category: only the SSN item's own number (shown as last 4). */
const OP_CONCEALED_OK: Record<string, string[]> = { "Social Security Number": ["number"] };

interface OpField {
  title?: string;
  id?: string;
  value?: Record<string, unknown>;
}
interface OpItem {
  state?: string;
  categoryUuid?: string;
  overview?: { title?: string };
  details?: { sections?: { title?: string; fields?: OpField[] }[] };
}

function parse1pux(data: Buffer): Parsed {
  const raw = unzipEntry(data, "export.data");
  if (!raw) throw new ImportError("That .1pux has no export.data inside. Export again from 1Password: File > Export > 1PUX.");
  let json: { accounts?: { vaults?: { attrs?: { name?: string }; items?: OpItem[] }[] }[] };
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ImportError("Couldn't read that 1Password export. Export again as 1PUX.");
  }
  const blocks: string[] = [];
  const cards: CardSecret[] = [];
  const counts = new Map<string, number>();
  for (const account of json.accounts ?? []) {
    for (const vault of account.vaults ?? []) {
      for (const item of vault.items ?? []) {
        const category = OP_CATEGORIES[item.categoryUuid ?? ""];
        if (!category || item.state === "archived") continue;
        const title = item.overview?.title?.trim() || category;
        const lines: string[] = [];
        let pan: string | null = null;
        for (const section of item.details?.sections ?? []) {
          for (const field of section.fields ?? []) {
            const [kind] = Object.keys(field.value ?? {});
            const label = (field.title || field.id || "").trim();
            if (!label || SECRET_FIELD.test(label) || SECRET_FIELD.test(field.id ?? "")) continue;
            const prefix = OP_PREFIX[category];
            const bare = !!prefix && !prefix.split(/[ ']/).some((w) => w.length > 3 && label.toLowerCase().includes(w.toLowerCase()));
            const named = bare ? `${prefix} ${label}` : label;
            // A full card number never goes to the model: last 4 in the text, the number itself encrypted for the fill.
            if (kind === "creditCardNumber") {
              const digits = String(Object.values(field.value ?? {})[0] ?? "").replace(/\D/g, "");
              if (category === "Credit Card" && digits.length >= 12 && !pan) pan = digits;
              if (digits.length >= 4) lines.push(`- ${named}: ending ${digits.slice(-4)}`);
              continue;
            }
            const concealedOk = kind === "concealed" && OP_CONCEALED_OK[category]?.includes(field.id ?? "");
            if (!OP_PLAIN_KINDS.has(kind ?? "") && !concealedOk) continue;
            const value = opValue(field.value);
            if (!value) continue;
            // Bank account and Social Security numbers: last 4 only (same rule as the Plaid import).
            const lastFour =
              concealedOk || (category === "Bank Account" && /account ?(no|number)|accountNo|iban/i.test(`${field.id} ${label}`));
            lines.push(`- ${named}: ${lastFour ? `ending ${value.replace(/\W/g, "").slice(-4)}` : scrubNumbers(value)}`);
          }
        }
        if (!lines.length) continue;
        if (pan) cards.push({ label: `1Password: ${title}`, number: pan });
        blocks.push(`1Password: ${category} "${title}"${vault.attrs?.name ? ` (vault ${vault.attrs.name})` : ""}\n${lines.join("\n")}`);
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
  }
  if (!blocks.length) {
    throw new ImportError(
      "No identities, cards, licenses, passports or bank accounts in that 1Password export. Logins and notes aren't imported.",
    );
  }
  return { kind: "vault", manager: "1password", name: vaultName("1Password", counts), text: blocks.join("\n\n"), items: blocks.length, cards };
}

/**
 * Last line of defence on a value that made it through: a card number (13-19 digits passing Luhn) or an
 * SSN-shaped number (123-45-6789) typed into some other field becomes "ending 1234".
 */
function scrubNumbers(value: string): string {
  return value
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, (m) => `ending ${m.slice(-4)}`)
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m) => {
      const d = m.replace(/\D/g, "");
      return luhn(d) ? `ending ${d.slice(-4)}` : m;
    });
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
}

/** One 1Password field value ({string}, {date}, {address}, …) as text, or null for kinds never imported. */
function opValue(v: Record<string, unknown> | undefined): string | null {
  if (!v) return null;
  const [kind, val] = Object.entries(v)[0] ?? [];
  if (val == null || val === "") return null;
  switch (kind) {
    case "date":
      return typeof val === "number" ? new Date(val * 1000).toISOString().slice(0, 10) : String(val);
    case "monthYear": {
      // 202908 -> 08/2029
      const s = String(val);
      return s.length === 6 ? `${s.slice(4)}/${s.slice(0, 4)}` : s;
    }
    case "email":
      return typeof val === "object" ? String((val as { email_address?: string }).email_address ?? "") || null : String(val);
    case "address": {
      const a = val as Record<string, string>;
      return [a.street, a.city, [a.state, a.zip].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ") || null;
    }
    case "string":
    case "phone":
    case "gender":
    case "menu":
    case "creditCardType":
    case "concealed":
      return typeof val === "object" ? null : String(val).trim() || null;
    default:
      // totp, url, sshKey, file, reference and any kind 1Password adds later.
      return null;
  }
}

/**
 * One file out of a zip, with node:zlib (no zip package): find the end-of-central-directory record, walk the central
 * directory to the entry, then inflate its data. Stored (0) and deflate (8) only, which is what 1Password writes.
 */
const ZIP_MAX_UNPACKED = 64 * 1024 * 1024;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** The end-of-central-directory record: entry count and where the central directory starts. */
function zipDirectory(zip: Buffer): { entries: number; offset: number } {
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) return { entries: zip.readUInt16LE(i + 10), offset: zip.readUInt32LE(i + 16) };
  }
  throw new ImportError("That .1pux isn't a valid zip. Export again from 1Password.");
}

/** Every entry name in the central directory (capped at 1000). */
function zipEntryNames(zip: Buffer): string[] {
  const { entries, offset } = zipDirectory(zip);
  const names: string[] = [];
  let p = offset;
  for (let n = 0; n < Math.min(entries, 1000) && p + 46 <= zip.length; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const nameLen = zip.readUInt16LE(p + 28);
    names.push(zip.subarray(p + 46, p + 46 + nameLen).toString("utf8"));
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return names;
}

function unzipEntry(zip: Buffer, want: string): Buffer | null {
  const { entries, offset } = zipDirectory(zip);
  let p = offset;
  for (let n = 0; n < entries && p + 46 <= zip.length; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const unpacked = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== want) continue;
    if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const body = zip.subarray(start, start + size);
    if (method === 0) return body;
    if (method !== 8) throw new ImportError("That .1pux uses a compression Formly can't read. Export again from 1Password.");
    // Capped so a zip bomb can't run away.
    if (unpacked > ZIP_MAX_UNPACKED) throw new ImportError("That 1Password export is too large to read.");
    return zlib.inflateRawSync(body, { maxOutputLength: ZIP_MAX_UNPACKED });
  }
  return null;
}

// ---------- Bitwarden (.json / .csv) ----------

interface BwItem {
  type?: number;
  name?: string;
  fields?: { name?: string; value?: string | null; type?: number }[];
  card?: Record<string, string | null>;
  identity?: Record<string, string | null>;
}

const BW_CARD: [key: string, label: string][] = [
  ["cardholderName", "cardholder name"],
  ["brand", "brand"],
  ["number", "number"],
  ["expMonth", "expiry month"],
  ["expYear", "expiry year"],
];
const BW_IDENTITY: [key: string, label: string][] = [
  ["title", "title"],
  ["firstName", "first name"],
  ["middleName", "middle name"],
  ["lastName", "last name"],
  ["company", "company"],
  ["email", "email"],
  ["phone", "phone"],
  ["address1", "address line 1"],
  ["address2", "address line 2"],
  ["address3", "address line 3"],
  ["city", "city"],
  ["state", "state"],
  ["postalCode", "postal code"],
  ["country", "country"],
  ["ssn", "Social Security number"],
  ["passportNumber", "passport number"],
  ["licenseNumber", "driver's license number"],
];

function parseBitwardenJson(text: string): Parsed {
  let json: { encrypted?: boolean; passwordProtected?: boolean; encKeyValidation_DO_NOT_EDIT?: string; items?: BwItem[] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError("Couldn't read that .json. Export from Bitwarden: Tools > Export vault > .json.");
  }
  if (json.encrypted || json.passwordProtected || json.encKeyValidation_DO_NOT_EDIT) {
    throw new ImportError(
      "That Bitwarden export is encrypted. Export again with File format .json (not \".json (Encrypted)\").",
    );
  }
  if (!Array.isArray(json.items)) {
    throw new ImportError("That .json isn't a Bitwarden vault export. Export from Bitwarden: Tools > Export vault > .json.");
  }
  const blocks: string[] = [];
  const cards: CardSecret[] = [];
  const counts = new Map<string, number>();
  // type 3 = card, 4 = identity. 1 (login) and 2 (secure note) are never read.
  for (const item of json.items) {
    const [category, data, fields] =
      item.type === 3 ? ["Card", item.card, BW_CARD] : item.type === 4 ? ["Identity", item.identity, BW_IDENTITY] : [null, null, null];
    if (!category || !data) continue;
    const title = item.name?.trim() || category;
    const lines = fields!.flatMap(([k, label]) => {
      const value = String(data[k] ?? "").trim();
      if (!value) return [];
      // Full card and Social Security numbers never go to the model: last 4 in the text. The card number itself is
      // kept encrypted for the fill (cardFill); the SSN is never filled, so it isn't kept at all.
      if (k === "number" || k === "ssn") {
        const digits = value.replace(/\D/g, "");
        if (k === "number" && digits.length >= 12) cards.push({ label: `Bitwarden: ${title}`, number: digits });
        return digits.length >= 4 ? [`- ${label}: ending ${digits.slice(-4)}`] : [];
      }
      return [`- ${label}: ${scrubNumbers(value)}`];
    });
    // Text custom fields only (type 0): Bitwarden has no birthday field, so people add one. Hidden (1) are skipped.
    for (const f of item.fields ?? []) {
      if (f.type === 0 && f.name && f.value && !SECRET_FIELD.test(f.name)) lines.push(`- ${f.name.trim()}: ${scrubNumbers(f.value.trim())}`);
    }
    if (!lines.length) continue;
    blocks.push(`Bitwarden: ${category} "${title}"\n${lines.join("\n")}`);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  if (!blocks.length) {
    throw new ImportError("No cards or identities in that Bitwarden export. Logins and notes aren't imported.");
  }
  return { kind: "vault", manager: "bitwarden", name: vaultName("Bitwarden", counts), text: blocks.join("\n\n"), items: blocks.length, cards };
}

function parseCsv(text: string): Parsed {
  const rows = csvRows(text);
  const header = (rows.shift() ?? []).map((c) => c.trim().toLowerCase());
  const col = (n: string) => header.indexOf(n);
  const has = (want: string[]) => want.every((w) => header.includes(w));

  if (has(BITWARDEN_CSV)) {
    // Bitwarden's .csv only carries logins and notes; take card / identity rows if a custom tool wrote any.
    const keep = rows.filter((r) => /^(card|identity)$/i.test(r[col("type")] ?? ""));
    if (!keep.length) {
      throw new ImportError(
        "Bitwarden's .csv export only has logins and notes, which Formly doesn't import from Bitwarden. Export as .json instead: Tools > Export vault > .json.",
      );
    }
    const blocks = keep.flatMap((r) => {
      // "fields" is "name: value" per line; never the login_* columns or notes.
      const lines = (r[col("fields")] ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^[^:]+:\s*\S/.test(l) && !SECRET_FIELD.test(l.split(":")[0]))
        .map((l) => `- ${scrubNumbers(l)}`);
      return lines.length ? [`Bitwarden: ${r[col("type")]} "${r[col("name")]?.trim() || "item"}"\n${lines.join("\n")}`] : [];
    });
    if (!blocks.length) throw new ImportError("No card or identity details in that Bitwarden .csv. Export as .json instead.");
    return { kind: "vault", manager: "bitwarden", name: `Bitwarden (${blocks.length} item${blocks.length === 1 ? "" : "s"})`, text: blocks.join("\n\n"), items: blocks.length, cards: [] };
  }

  // Apple Passwords: Title,URL,Username,Password,Notes,OTPAuth. Chrome / Google: name,url,username,password,note.
  const apple = has(APPLE_HEADER);
  if (!apple && !has(CHROME_HEADER)) {
    throw new ImportError(
      "Formly can't read that .csv. Use the export from Apple Passwords, Google Password Manager / Chrome, or Bitwarden (.json).",
    );
  }
  const [iSite, iUrl, iUser, iPass] = [col(apple ? "title" : "name"), col("url"), col("username"), col("password")];
  const iOtp = col("otpauth");
  const logins: LoginRow[] = [];
  for (const r of rows) {
    const url = r[iUrl]?.trim() || null;
    const username = r[iUser]?.trim() || null;
    const password = r[iPass] ?? "";
    if (!username && !password) continue;
    logins.push({ site: siteOf(url, r[iSite]), url, username, password, otp: iOtp >= 0 ? r[iOtp]?.trim() || null : null });
  }
  if (!logins.length) throw new ImportError("That export has no saved logins in it.");
  return { kind: "logins", manager: apple ? "apple" : "chrome", logins };
}

/** "1Password (1 identity, 1 credit card, 1 driver license)". */
function vaultName(manager: string, counts: Map<string, number>) {
  const plural = (c: string) => (c.endsWith("y") ? `${c.slice(0, -1)}ies` : `${c}s`);
  const parts = [...counts].map(([c, n]) => `${n} ${n === 1 ? c.toLowerCase() : plural(c.toLowerCase())}`);
  return `${manager} (${parts.join(", ")})`;
}

/** RFC 4180 CSV: quoted fields with commas, doubled quotes and newlines. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

function splitCsvLine(line: string): string[] {
  return csvRows(line)[0] ?? [];
}

/**
 * The site a login is for: its registrable domain (secure.chase.com -> chase.com, idp.u.washington.edu ->
 * washington.edu, x.co.uk keeps three labels), "spotify (Android app)" for an app login, else the entry's title.
 */
function siteOf(url: string | null, title: string | undefined): string {
  const app = url?.match(/^android:\/\/[^@]*@([\w.]+)/i);
  if (app) {
    const parts = app[1].split(".");
    return `${parts[1] ?? parts[0]} (Android app)`;
  }
  if (url) {
    try {
      const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
      const labels = host.split(".").filter(Boolean);
      if (/^\d+$/.test(labels.at(-1) ?? "")) return host;
      // A two-letter country code under co / com / org / net / ac / gov / edu is a public suffix of its own.
      const keep = labels.length > 2 && /^[a-z]{2}$/.test(labels.at(-1)!) && /^(co|com|org|net|ac|gov|edu)$/.test(labels.at(-2)!) ? 3 : 2;
      if (labels.length) return labels.slice(-keep).join(".");
    } catch {
      // Not a URL; fall through to the title.
    }
  }
  return (title ?? "").trim().replace(/\s*\(.*\)$/, "") || "app";
}

// ---------- encrypted logins ----------

const keyStore = globalThis as unknown as { __formlySecret?: Buffer };

/**
 * The AES-256 key: FORMLY_SECRET (64 hex chars = 32 bytes). Unset, one is generated once and appended to .env.development.local (gitignored) so
 * it survives a restart; if that file can't be written (a read-only deploy) it lives in memory for this process.
 * Any other non-empty value is stretched with SHA-256. The key itself is never logged.
 */
function secretKey(): Buffer {
  if (keyStore.__formlySecret) return keyStore.__formlySecret;
  let secret = process.env.FORMLY_SECRET?.trim();
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    process.env.FORMLY_SECRET = secret;
    try {
      // Never .env.local: that file is tracked in this repo, and the key must not reach git. .env.*.local is gitignored.
      const file = path.join(process.cwd(), `.env.${process.env.NODE_ENV === "production" ? "production" : "development"}.local`);
      const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (!/^FORMLY_SECRET=/m.test(existing)) {
        fs.appendFileSync(
          file,
          `${existing && !existing.endsWith("\n") ? "\n" : ""}# Encrypts imported saved logins (AES-256-GCM). Generated by Formly; changing it makes stored logins unreadable.\nFORMLY_SECRET=${secret}\n`,
          { mode: 0o600 },
        );
      }
    } catch {
      console.warn("[formly] FORMLY_SECRET is unset and .env.local isn't writable (.env.*.local); saved logins use a key kept in memory");
    }
  }
  const key = /^[0-9a-f]{64}$/i.test(secret) ? Buffer.from(secret, "hex") : crypto.createHash("sha256").update(secret).digest();
  return (keyStore.__formlySecret = key);
}

/** "v1:" + base64(iv 12 | tag 16 | ciphertext). The user id is the AAD, so a row can't be moved to another user. */
export function encryptSecret(plain: string, userId: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** The inverse, for code that fills a password field. No route returns it. */
export function decryptSecret(enc: string, userId: string): string {
  const raw = Buffer.from(enc.replace(/^v1:/, ""), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** Card number fields on a form ("Card number", "cc-number"), never the CVV, expiry or name on card. */
const CARD_NUMBER_FIELD = /\b(card|credit|debit|cc)[ _-]?(number|no\b|num\b|#)|\bcc-?number\b|\bcardnumber\b|\bpan\b/i;

/**
 * Card number fields filled in code from vault_cards, never through the model (same contract as lib/plaid.ts
 * plaidBankFill): value is the real number for the form, display is what review shows (masked). The caller puts
 * these behind an explicit permission prompt. Uses the most recently imported card; [] when there is none.
 */
export function cardFill(
  userId: string,
  fields: FormField[],
): { fieldId: string; value: string; display: string; source: string }[] {
  const wanted = fields.filter((f) => CARD_NUMBER_FIELD.test(`${f.id} ${f.label}`) && !/cvv|cvc|security|expir|name/i.test(f.label));
  if (!wanted.length) return [];
  const card = db
    .prepare("SELECT label, last4, number_enc FROM vault_cards WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(userId) as { label: string; last4: string; number_enc: string } | undefined;
  if (!card) return [];
  const number = decryptSecret(card.number_enc, userId);
  const source = `${card.label}, card ending ${card.last4}`;
  return wanted.map((f) => ({ fieldId: f.id, value: number, display: `••••${card.last4}`, source }));
}

export function loginCount(userId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM logins WHERE user_id = ?").get(userId) as { n: number }).n;
}

/** Drop this visitor's saved logins and the summary source made from them. Returns the logins deleted. */
export function deleteLogins(userId: string): number {
  const n = db.transaction(() => {
    db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'passwords'").run(userId);
    return db.prepare("DELETE FROM logins WHERE user_id = ?").run(userId).changes;
  })();
  scrubDeleted();
  return n;
}

/** Drop this visitor's 1Password / Bitwarden source (the trigger takes its card numbers). Returns the rows deleted. */
export function deleteVault(userId: string): number {
  const n = db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'password-manager'").run(userId).changes;
  scrubDeleted();
  return n;
}

/**
 * The only thing from saved logins the twin ever sees: which emails / usernames the user signs in with (most used
 * first) and the sites they have accounts on. No passwords, OTP secrets, notes or URLs.
 */
export function loginSummary(userId: string): { name: string; text: string } | null {
  const rows = db.prepare("SELECT source, site, username FROM logins WHERE user_id = ?").all(userId) as {
    source: string;
    site: string;
    username: string | null;
  }[];
  if (!rows.length) return null;
  const tally = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const accounts = tally(rows.flatMap((r) => (r.username ? [r.username.toLowerCase()] : []))).slice(0, 15);
  const sites = tally(rows.map((r) => r.site)).slice(0, 30);
  // Not "Google Password Manager" here: the twin prompt treats a "Google account" as the identity anchor, and a saved
  // login is only evidence of which emails the user signs in to websites with.
  const from = [...new Set(rows.map((r) => (r.source === "chrome" ? "Chrome" : (MANAGER_NAMES[r.source as Manager] ?? r.source))))].join(" and ");
  const text = [
    `Saved website logins (${from} password export): ${rows.length} login${rows.length === 1 ? "" : "s"}. Passwords are not included.`,
    "",
    "Emails and usernames the user signs in to websites with, most used first:",
    ...accounts.map(([a, n]) => `- ${a}: used on ${n} site${n === 1 ? "" : "s"}`),
    "",
    `Sites the user has accounts on (most saved first): ${sites.map(([s]) => s).join(", ")}`,
  ].join("\n");
  return { name: `Saved logins (${rows.length}, ${from})`, text };
}

/**
 * Save a parsed export for this visitor. Vault items replace the previous password-manager source. Logins replace
 * the previous logins from the same manager, then the summary source is rebuilt from every saved login. `started`
 * is when the request began: a "Delete my data" since then wins and nothing is written. Returns false in that case.
 */
export function saveImport(userId: string, parsed: Parsed, started: number): boolean {
  const insertSource = db.prepare(
    "INSERT INTO sources (id, user_id, connector, name, mime, text, created_at) VALUES (?, ?, ?, ?, 'text/plain', ?, ?)",
  );
  const saved = db.transaction(() => {
    if (wipedSince(userId, started)) return false;
    const now = Date.now();
    if (parsed.kind === "vault") {
      // The trigger drops the previous import's card numbers with its source.
      db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'password-manager'").run(userId);
      insertSource.run(nanoid(), userId, "password-manager", parsed.name, parsed.text, now);
      const insertCard = db.prepare(
        "INSERT INTO vault_cards (id, user_id, label, last4, number_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const c of parsed.cards) insertCard.run(nanoid(), userId, c.label, c.number.slice(-4), encryptSecret(c.number, userId), now);
      return true;
    }
    db.prepare("DELETE FROM logins WHERE user_id = ? AND source = ?").run(userId, parsed.manager);
    const insert = db.prepare(
      "INSERT INTO logins (id, user_id, source, site, url, username, password_enc, otp_enc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const l of parsed.logins) {
      insert.run(
        nanoid(),
        userId,
        parsed.manager,
        l.site,
        l.url,
        l.username,
        l.password ? encryptSecret(l.password, userId) : null,
        l.otp ? encryptSecret(l.otp, userId) : null,
        now,
      );
    }
    db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'passwords'").run(userId);
    const summary = loginSummary(userId);
    if (summary) insertSource.run(nanoid(), userId, "passwords", summary.name, summary.text, now);
    return true;
  })();
  // The rows this import replaced leave the WAL too.
  scrubDeleted();
  return saved;
}
