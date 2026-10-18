import JSZip from "jszip";
import mammoth from "mammoth";
import { transcribeFile } from "./llm";
import { isPasswordExport } from "./passwordManager";

const TEXT_EXT = /\.(txt|md|json|csv|tsv)$/i;
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
};

/** File types extractText can read, by extension. */
export function isSupported(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXT.test(name) || ext === "docx" || ext === "pdf" || ext in IMAGE_MIME;
}

export interface UploadFile {
  name: string;
  type: string;
  data: Buffer;
}

const ZIP_MAX_FILES = 50;
const ZIP_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Replace each .zip with the supported files inside it (folders flattened, Mac metadata and
 * nested zips skipped). Caps on file count and unpacked size keep a zip bomb from running away.
 */
export async function expandZips(files: UploadFile[]): Promise<{ files: UploadFile[]; errors: string[] }> {
  const out: UploadFile[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name) && file.type !== "application/zip") {
      out.push(file);
      continue;
    }
    try {
      const zip = await JSZip.loadAsync(file.data);
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && !e.name.startsWith("__MACOSX/") && !e.name.split("/").pop()!.startsWith(".") && isSupported(e.name),
      );
      if (!entries.length) {
        errors.push(`${file.name}: no supported files inside`);
        continue;
      }
      if (entries.length > ZIP_MAX_FILES) {
        errors.push(`${file.name}: only the first ${ZIP_MAX_FILES} of ${entries.length} files were read`);
      }
      let bytes = 0;
      for (const entry of entries.slice(0, ZIP_MAX_FILES)) {
        const data = await entry.async("nodebuffer");
        bytes += data.length;
        if (bytes > ZIP_MAX_BYTES) {
          errors.push(`${file.name}: too large to unpack, stopped at ${entry.name}`);
          break;
        }
        out.push({ name: entry.name.split("/").pop()!, type: "", data });
      }
    } catch {
      errors.push(`${file.name}: couldn't open the zip`);
    }
  }
  return { files: out, errors };
}

/** Stage 1: turn any supported upload into plain text. */
export async function extractText(name: string, mime: string, data: Buffer): Promise<string> {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  // A password-manager export must never reach Gemini as raw text: only the password-manager import reads it.
  if (isPasswordExport(name, data)) {
    throw new Error("This is a password manager export. Add it with Password manager instead, so passwords are never read");
  }

  // Before the generic text branch: these arrive as text/vcard or message/rfc822 but need parsing.
  if (ext === "vcf" || /^text\/(x-)?vcard$/i.test(mime)) return vcardText(data.toString("utf8"));
  if (ext === "eml" || mime === "message/rfc822") return emailText(data.toString("latin1"));

  if (TEXT_EXT.test(name) || mime.startsWith("text/")) {
    const raw = data.toString("utf8");
    if (ext === "json") {
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: data });
    return value;
  }

  if (ext === "pdf" || mime === "application/pdf") {
    return transcribeFile(name, "application/pdf", data);
  }

  const imageMime = mime.startsWith("image/") ? mime : IMAGE_MIME[ext];
  if (imageMime) return transcribeFile(name, imageMime, data);

  throw new Error(`Unsupported file type: ${name}`);
}

// ---------- vCard ----------

/** vCard (.vcf, 2.1 / 3.0 / 4.0) -> one labelled block per card: name, phones, emails, addresses, birthday. */
function vcardText(raw: string): string {
  // Unfold continuation lines (RFC 6350 3.2), then join 2.1 quoted-printable soft breaks (only on QP
  // lines: base64 PHOTO values also end in "=").
  const lines: string[] = [];
  for (const line of raw.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
    const prev = lines[lines.length - 1];
    if (prev && /QUOTED-PRINTABLE/i.test(prev.split(":")[0]) && prev.endsWith("="))
      lines[lines.length - 1] = prev.slice(0, -1) + line;
    else lines.push(line);
  }

  const cards: string[][] = [];
  let card: string[] | null = null;
  let fn = "";
  let n = "";
  for (const line of lines) {
    const m = /^(?:[\w-]+\.)?([\w-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (!m) continue;
    const prop = m[1].toUpperCase();
    const params = m[2].toUpperCase();
    const value = params.includes("QUOTED-PRINTABLE") ? decodeQP(m[3], charsetOf(params)) : m[3];
    if (prop === "BEGIN" && value.toUpperCase() === "VCARD") {
      card = [];
      fn = n = "";
    } else if (prop === "END" && card) {
      const name = fn || n;
      cards.push(name ? [`Name: ${name}`, ...card] : card);
      card = null;
    } else if (card) {
      const type = typeOf(params);
      const label = (l: string) => (type ? `${l} (${type})` : l);
      if (prop === "FN") fn = unescape(value);
      else if (prop === "N") {
        // Family;Given;Additional;Prefix;Suffix
        const [family, given, extra, prefix, suffix] = splitValue(value);
        n = [prefix, given, extra, family, suffix].filter(Boolean).join(" ");
      } else if (prop === "TEL") card.push(`${label("Phone")}: ${unescape(value).replace(/^tel:/i, "")}`);
      else if (prop === "EMAIL") card.push(`${label("Email")}: ${unescape(value)}`);
      else if (prop === "ADR") {
        // PO box;Extended;Street;City;Region;Postal code;Country
        const [box, extended, street, city, region, postal, country] = splitValue(value);
        const line1 = [box && `PO Box ${box}`, street, extended].filter(Boolean).join(", ");
        const line2 = [city, [region, postal].filter(Boolean).join(" "), country].filter(Boolean).join(", ");
        const full = [line1, line2].filter(Boolean).join(", ");
        if (full) card.push(`${label("Address")}: ${full}`);
      } else if (prop === "BDAY") card.push(`Birthday: ${formatBday(value)}`);
    }
  }

  if (cards.length === 0) throw new Error("No contacts found in this vCard");
  const head = cards.length === 1 ? "Contact card (vCard)" : `Contact cards (vCard, ${cards.length} contacts)`;
  return [head, ...cards.map((c) => c.join("\n"))].join("\n\n");
}

/** TYPE=CELL,PREF or 2.1-style ;HOME;VOICE -> "cell", skipping noise like PREF/VOICE/INTERNET. */
function typeOf(params: string): string {
  const types = params
    .split(";")
    .flatMap((p) => (p.startsWith("TYPE=") ? p.slice(5).replace(/"/g, "").split(",") : p.includes("=") ? [] : [p]))
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && !["pref", "voice", "internet", "x400"].includes(t));
  return [...new Set(types)].join(", ");
}

function charsetOf(params: string): string {
  return /CHARSET=([\w-]+)/.exec(params)?.[1] ?? "utf-8";
}

function splitValue(value: string): string[] {
  return value.split(/(?<!\\);/).map((p) => unescape(p).trim());
}

function unescape(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\([,;\\])/g, "$1")
    .trim();
}

/** 19900115, 1990-01-15 or --0115 (no year) -> 1990-01-15 / 01-15 (no year). */
function formatBday(v: string): string {
  const m = /^(\d{4}|--)-?(\d{2})-?(\d{2})/.exec(v.trim());
  if (!m) return v.trim();
  return m[1] === "--" ? `${m[2]}-${m[3]} (no year)` : `${m[1]}-${m[2]}-${m[3]}`;
}

// ---------- Email (.eml) ----------

const EMAIL_HEADERS = ["From", "To", "Date", "Subject"];

/** RFC 822 email -> headers that matter + the plain-text body (HTML stripped if that's all there is). */
function emailText(raw: string): string {
  const { headers, body } = parsePart(raw);
  const lines = EMAIL_HEADERS.filter((h) => headers[h.toLowerCase()]).map(
    (h) => `${h}: ${headerText(headers[h.toLowerCase()])}`,
  );
  const attachments: string[] = [];
  const text = bodyText(headers, body, attachments).trim();
  if (attachments.length) lines.push(`Attachments (not read): ${attachments.join(", ")}`);
  return ["Email", ...lines, "", text || "(no text body)"].join("\n");
}

function parsePart(raw: string): { headers: Record<string, string>; body: string } {
  const split = /\r?\n\r?\n/.exec(raw);
  const head = split ? raw.slice(0, split.index) : raw;
  const body = split ? raw.slice(split.index + split[0].length) : "";
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] ??= line.slice(i + 1).trim();
  }
  return { headers, body };
}

/** Walks multipart bodies, preferring text/plain over text/html in each alternative. */
function bodyText(headers: Record<string, string>, body: string, attachments: string[]): string {
  const type = headers["content-type"] ?? "text/plain";
  const disposition = headers["content-disposition"] ?? "";
  const filename = /(?:file)?name\*?="?([^";]+)"?/i.exec(`${disposition};${type}`)?.[1];
  if (/^attachment/i.test(disposition) || (filename && !/^text\//i.test(type))) {
    if (filename) attachments.push(headerText(filename));
    return "";
  }

  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (/^multipart\//i.test(type) && boundary) {
    const parts = body
      .split(`--${boundary}`)
      .slice(1)
      .filter((p) => !p.startsWith("--"))
      .map((p) => parsePart(p.replace(/^\r?\n/, "")));
    if (/^multipart\/alternative/i.test(type)) {
      const plain = parts.find((p) => /^text\/plain/i.test(p.headers["content-type"] ?? "text/plain"));
      const pick = plain ?? parts.find((p) => /^text\/html/i.test(p.headers["content-type"] ?? "")) ?? parts[0];
      return pick ? bodyText(pick.headers, pick.body, attachments) : "";
    }
    return parts
      .map((p) => bodyText(p.headers, p.body, attachments))
      .filter(Boolean)
      .join("\n\n");
  }

  if (!/^text\//i.test(type)) return "";
  const charset = /charset="?([\w-]+)"?/i.exec(type)?.[1] ?? "utf-8";
  const encoding = (headers["content-transfer-encoding"] ?? "").toLowerCase();
  const decoded =
    encoding === "base64"
      ? decodeBytes(Buffer.from(body.replace(/\s+/g, ""), "base64"), charset)
      : encoding === "quoted-printable"
        ? decodeQP(body, charset)
        : decodeBytes(Buffer.from(body, "latin1"), charset);
  return /^text\/html/i.test(type) ? htmlToText(decoded) : decoded;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n");
}

/** Header value read as latin1 bytes: raw UTF-8 back to text, then RFC 2047 encoded words. */
function headerText(v: string): string {
  return decodeWords(Buffer.from(v, "latin1").toString("utf8"));
}

/** RFC 2047 encoded words in headers: =?UTF-8?B?...?= / =?UTF-8?Q?...?=. */
function decodeWords(v: string): string {
  return v.replace(/=\?([\w-]+)\?([BQ])\?([^?]*)\?=\s*/gi, (_, charset: string, enc: string, text: string) =>
    enc.toUpperCase() === "B"
      ? decodeBytes(Buffer.from(text, "base64"), charset)
      : decodeQP(text.replace(/_/g, " "), charset),
  );
}

function decodeQP(v: string, charset: string): string {
  const bytes: number[] = [];
  const s = v.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i) & 0xff);
  }
  return decodeBytes(Buffer.from(bytes), charset);
}

function decodeBytes(buf: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}
