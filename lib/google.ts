import { nanoid } from "nanoid";
import { db } from "./db";
import { extractText } from "./extract";
import { deleteTokens, getTokens, saveTokens, updateTokens } from "./oauth";
import { WipedError, wipedSince } from "./wipes";

export type GoogleScope = "profile" | "contacts" | "gmail" | "drive";
export const GOOGLE_SYNC_SCOPES: GoogleScope[] = ["profile", "contacts", "gmail", "drive"];
const LABELS: Record<GoogleScope, string> = { profile: "Profile", contacts: "Contacts", gmail: "Gmail", drive: "Drive" };

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const PEOPLE = "https://people.googleapis.com/v1";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const DRIVE = "https://www.googleapis.com/drive/v3";

const G = "https://www.googleapis.com/auth/";
/** Read-only scopes, one per thing a form needs. Each Formly scope maps to the Google scopes it requires. */
const OAUTH_SCOPES: Record<GoogleScope, string[]> = {
  profile: [`${G}userinfo.profile`, `${G}user.birthday.read`, `${G}user.phonenumbers.read`, `${G}user.addresses.read`],
  contacts: [`${G}contacts.readonly`],
  gmail: [`${G}gmail.readonly`],
  drive: [`${G}drive.readonly`],
};
const LOGIN_SCOPES = ["openid", "email", "profile"];
/** Address, phone and birthday: "sensitive" scopes, so Google shows its unverified-app warning for them. */
const DETAIL_SCOPES = OAUTH_SCOPES.profile.slice(1);
/** Only the files the user picks in the Google Picker: non-sensitive, no warning screen. */
const PICKED_FILES_SCOPE = `${G}drive.file`;

/**
 * GOOGLE_ACCESS picks how much Formly asks Google for.
 * full (default): profile details, contacts, targeted Gmail searches and Drive search (read-only). Gmail and
 *   Drive are restricted scopes, so this works for test users listed on the consent screen while the app is
 *   in Testing mode, behind Google's unverified-app screen.
 * picker: sign-in + drive.file only, the user picks documents in the Google Picker; address, phone and
 *   birthday are an opt-in extra (incremental auth). Gmail is off. Safe for any judge's account.
 */
export type GoogleAccess = "full" | "picker";
export function googleAccess(): GoogleAccess {
  return process.env.GOOGLE_ACCESS?.trim().toLowerCase() === "picker" ? "picker" : "full";
}

/** What a sync may import in each access mode. */
export function googleSyncScopes(access = googleAccess()): GoogleScope[] {
  return access === "full" ? GOOGLE_SYNC_SCOPES : ["profile"];
}

/** The Picker also needs a browser API key and the Cloud project number. */
export function pickerConfigured(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_APP_ID);
}

// Import limits, so a sync stays a handful of form-relevant items, not the whole account.
const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EMAIL_CHARS = 4000;
const MAX_DOC_CHARS = 20000;
const MAX_CONTACTS = 20;
// Tuned against a real student inbox (2026-10-18): newsletters (Substack, beehiiv) and Nextdoor posts match
// keyword searches, bank statements match "statement", and family members' orders and forwarded bookings
// carry other people's names and addresses. Hence the sender lists, the category filters and no forwards.
const NOT_NOISE = "-category:promotions -category:social -subject:(fwd OR fw) -from:(substack.com OR beehiiv.com)";
const CARRIERS =
  "t-mobile.com OR verizon.com OR vzw.com OR verizonwireless.com OR att.com OR att-mail.com OR mintmobile.com OR visible.com OR fi.google.com OR cricketwireless.com OR metrobyt-mobile.com OR uscellular.com OR boostmobile.com OR xfinity.com OR spectrum.com OR consumercellular.com OR straighttalk.com OR tracfone.com";
const STREAMING =
  "netflix.com OR spotify.com OR hulu.com OR disneyplus.com OR email.apple.com OR max.com OR youtube.com OR peacocktv.com OR paramountplus.com OR primevideo.com";
const PHONE_SELLERS = "orders.apple.com OR email.apple.com OR samsung.com OR store.google.com OR bestbuy.com OR amazon.com OR backmarket.com";
const BANKS = "chase.com OR bankofamerica.com OR wellsfargo.com OR capitalone.com OR citi.com OR americanexpress.com OR discover.com";
/**
 * Targeted Gmail searches, newest `max` of each: only mail a signup, application or credit form can use.
 * Carrier mail gives the current carrier, number, line count and plan; order mail gives the shipping
 * address and the phone they bought; streaming receipts feed the plan suggestion; offer letters, pay stubs
 * and tax forms give employer and income; utility bills prove the address; ID and travel mail gives ID details.
 */
const GMAIL_QUERIES: { kind: string; q: string; max: number; attachments: boolean }[] = [
  { kind: "Phone carrier", q: `from:(${CARRIERS}) newer_than:2y ${NOT_NOISE}`, max: 5, attachments: true },
  { kind: "Shipping address", q: `subject:(shipped OR delivered OR "order confirmation") newer_than:1y ${NOT_NOISE}`, max: 3, attachments: false },
  { kind: "Phone purchase", q: `from:(${PHONE_SELLERS}) (iPhone OR Galaxy OR Pixel) (order OR receipt OR shipped) newer_than:3y ${NOT_NOISE}`, max: 3, attachments: false },
  { kind: "Streaming", q: `from:(${STREAMING}) (receipt OR membership OR subscription OR invoice OR payment) newer_than:1y ${NOT_NOISE}`, max: 5, attachments: false },
  { kind: "Offer letter / employment", q: `subject:("offer letter" OR "employment verification" OR "offer of employment") ${NOT_NOISE}`, max: 3, attachments: true },
  { kind: "Pay stub", q: `subject:("pay stub" OR paystub OR payslip OR "earnings statement" OR "pay statement") ${NOT_NOISE}`, max: 3, attachments: true },
  { kind: "Tax form", q: `subject:(W-2 OR 1099 OR "tax return" OR "tax document") newer_than:2y ${NOT_NOISE}`, max: 2, attachments: true },
  {
    kind: "Utility bill",
    q: `subject:(statement OR bill) (electric OR gas OR water OR internet OR utility OR energy) newer_than:1y -from:(${BANKS}) ${NOT_NOISE}`,
    max: 3,
    attachments: true,
  },
  {
    kind: "ID / travel",
    q: `subject:(passport OR "driver license" OR "driver's license" OR DMV OR "real id" OR "TSA PreCheck" OR "Global Entry") newer_than:3y ${NOT_NOISE}`,
    max: 3,
    attachments: true,
  },
];
const DRIVE_NAMES = [
  "resume", "CV", "license", "licence", "passport", "pay stub", "paystub", "payslip", "offer letter", "lease",
  "W-2", "1099", "tax return",
];
const GOOGLE_DOC = "application/vnd.google-apps.document";
const FILE_MIME = /^(application\/pdf|image\/|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$|text\/plain$)/;

type SyncFile = { name: string; mime: string; data: Buffer };

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleConnection(userId: string): { email: string; scopes: string } | null {
  const t = getTokens(userId, "google");
  return t ? { email: t.account, scopes: t.scopes } : null;
}

/** Picker mode: whether this visitor also granted address, phone and birthday (the opt-in extra). */
export function googleDetailsGranted(userId: string): boolean {
  const granted = new Set((getTokens(userId, "google")?.scopes ?? "").split(/\s+/));
  return DETAIL_SCOPES.every((s) => granted.has(s));
}

/** Cookie holding the pending state, binding a sign-in to the browser that started it. */
export const GOOGLE_STATE_COOKIE = "formly_google_state";

export const googleRedirectUri = (origin: string) => `${origin}/api/connectors/google/callback`;

/** The Google scopes a sign-in asks for. `details` adds address, phone and birthday in picker mode. */
export function googleOAuthScopes(access = googleAccess(), details = false): string[] {
  if (access === "full") return [...LOGIN_SCOPES, ...DETAIL_SCOPES, ...OAUTH_SCOPES.contacts, ...OAUTH_SCOPES.gmail, ...OAUTH_SCOPES.drive];
  return [...LOGIN_SCOPES, PICKED_FILES_SCOPE, ...(details ? DETAIL_SCOPES : [])];
}

/**
 * Consent URL: offline access (refresh token), forced consent so Google re-issues it, PKCE S256.
 * include_granted_scopes makes a second sign-in (picker mode's "also add my address…") incremental.
 */
export function googleAuthUrl(origin: string, state: string, challenge: string, opts: { details?: boolean } = {}): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: googleOAuthScopes(googleAccess(), opts.details).join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const err = new Error(`Google token request failed: ${json.error ?? res.status}`) as Error & { code?: string };
    err.code = json.error;
    throw err;
  }
  return json as TokenResponse;
}

/** Account email from the id_token. It came straight from Google's token endpoint over TLS, so no signature check is needed. */
function emailFromIdToken(idToken?: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** Callback step: trade the code (+ PKCE verifier) for tokens and store them. Returns the account email. */
export async function exchangeGoogleCode(userId: string, code: string, verifier: string, origin: string): Promise<string> {
  const started = Date.now();
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: googleRedirectUri(origin),
  });
  let account = emailFromIdToken(t.id_token);
  if (!account) {
    const info = await gget<{ email?: string }>("https://openidconnect.googleapis.com/v1/userinfo", t.access_token).catch(
      () => ({}) as { email?: string },
    );
    account = info.email ?? "Google account";
  }
  // Deleted their data while the code was being exchanged: don't keep a grant they just wiped.
  if (wipedSince(userId, started)) {
    await revokeGoogleToken(t.refresh_token ?? t.access_token);
    throw new WipedError();
  }
  saveTokens(userId, "google", { account, access_token: t.access_token, refresh_token: t.refresh_token, expires_in: t.expires_in, scopes: t.scope ?? "" });
  return account;
}

/** A valid access token, refreshed when it expires within a minute. A revoked grant disconnects Google. */
export async function googleAccessToken(userId: string): Promise<string> {
  const t = getTokens(userId, "google");
  if (!t) throw new Error("Google isn't connected");
  if (t.expires_at - 60_000 > Date.now()) return t.access_token;
  if (!t.refresh_token) throw new Error("Your Google sign-in expired. Connect Google again.");
  try {
    const r = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
    // Update only: a grant deleted while the refresh ran stays deleted.
    if (!updateTokens(userId, "google", { access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expires_in, scopes: r.scope ?? t.scopes }))
      throw new Error("Google isn't connected");
    return r.access_token;
  } catch (e) {
    if ((e as { code?: string }).code === "invalid_grant") {
      deleteTokens(userId, "google");
      throw new Error("Google access was revoked. Connect Google again.");
    }
    throw e;
  }
}

/** Revoke a grant at Google (best effort): the refresh token revokes the whole grant, access tokens included. */
export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => undefined);
}

/** Disconnect: revoke the grant at Google (best effort) and forget the tokens. */
export async function revokeGoogle(userId: string): Promise<void> {
  const t = getTokens(userId, "google");
  deleteTokens(userId, "google");
  const token = t?.refresh_token ?? t?.access_token;
  if (token) await revokeGoogleToken(token);
}

async function gfetch(url: string, token: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`${new URL(url).hostname.split(".")[0]} ${res.status}: ${body?.error?.message?.slice(0, 160) ?? res.statusText}`);
  }
  return res;
}
const gget = async <T>(url: string, token: string) => (await gfetch(url, token)).json() as Promise<T>;

const monthYear = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

// ---------- People API ----------

interface GDate {
  year?: number;
  month?: number;
  day?: number;
}
interface Person {
  resourceName?: string;
  names?: { displayName?: string }[];
  birthdays?: { date?: GDate }[];
  phoneNumbers?: { value?: string; type?: string; formattedType?: string }[];
  addresses?: { formattedValue?: string; type?: string; formattedType?: string }[];
  emailAddresses?: { value?: string; type?: string }[];
  relations?: { person?: string; type?: string; formattedType?: string }[];
  memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[];
}

const typed = (v: { type?: string; formattedType?: string }) => (v.formattedType || v.type ? ` (${v.formattedType || v.type})` : "");
const fmtDate = (d: GDate) =>
  [d.year, d.month, d.day].every(Boolean)
    ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
    : `${d.month}/${d.day}${d.year ? `/${d.year}` : ""}`;

async function syncProfile(token: string): Promise<string> {
  const me = await gget<Person>(
    `${PEOPLE}/people/me?personFields=names,birthdays,phoneNumbers,addresses,emailAddresses,relations`,
    token,
  );
  const lines = ["## Google profile (People API)"];
  const name = me.names?.[0]?.displayName;
  if (name) lines.push(`Name: ${name}`);
  const bday = me.birthdays?.find((b) => b.date?.year)?.date ?? me.birthdays?.[0]?.date;
  if (bday) lines.push(`Date of birth: ${fmtDate(bday)}`);
  for (const e of me.emailAddresses ?? []) if (e.value) lines.push(`Email${typed(e)}: ${e.value}`);
  for (const p of me.phoneNumbers ?? []) if (p.value) lines.push(`Phone${typed(p)}: ${p.value}`);
  for (const a of me.addresses ?? []) if (a.formattedValue) lines.push(`Address${typed(a)}: ${a.formattedValue.replace(/\n/g, ", ")}`);
  for (const r of me.relations ?? []) if (r.person) lines.push(`Relation${typed(r)}: ${r.person}`);
  return lines.join("\n");
}

/** Emergency-contact candidates only: starred or Family/Emergency-labelled contacts, else the first 20 with a phone. */
async function syncContacts(token: string): Promise<string> {
  const groups = await gget<{ contactGroups?: { resourceName: string; formattedName?: string; name?: string }[] }>(
    `${PEOPLE}/contactGroups?pageSize=200`,
    token,
  );
  const wanted = new Map<string, string>([["contactGroups/starred", "Starred"]]);
  for (const g of groups.contactGroups ?? []) {
    const label = g.formattedName || g.name || "";
    if (/family|emergency/i.test(label)) wanted.set(g.resourceName, label);
  }
  const res = await gget<{ connections?: Person[] }>(
    `${PEOPLE}/people/me/connections?personFields=names,phoneNumbers,emailAddresses,memberships&pageSize=1000&sortOrder=LAST_MODIFIED_DESCENDING`,
    token,
  );
  const all = (res.connections ?? []).filter((p) => p.names?.[0]?.displayName);
  const labelsOf = (p: Person) =>
    (p.memberships ?? []).map((m) => wanted.get(m.contactGroupMembership?.contactGroupResourceName ?? "")).filter(Boolean) as string[];
  let picked = all.filter((p) => labelsOf(p).length > 0);
  const fallback = picked.length === 0;
  if (fallback) picked = all.filter((p) => p.phoneNumbers?.some((n) => n.value));
  picked = picked.slice(0, MAX_CONTACTS);
  if (picked.length === 0) return "";

  const lines = [
    fallback
      ? "## Google Contacts: contacts with a phone number (none are starred or labelled Family/Emergency)"
      : "## Google Contacts: starred and Family/Emergency contacts (emergency contact candidates)",
  ];
  for (const p of picked) {
    const bits = [
      ...(p.phoneNumbers ?? []).filter((n) => n.value).map((n) => `phone${typed(n)} ${n.value}`),
      ...(p.emailAddresses ?? []).filter((e) => e.value).map((e) => `email ${e.value}`),
    ];
    const labels = labelsOf(p);
    lines.push(`- ${p.names![0].displayName}${labels.length ? ` [${labels.join(", ")}]` : ""}: ${bits.join("; ") || "no phone or email"}`);
  }
  return lines.join("\n");
}

// ---------- Gmail ----------

interface GPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GPart[];
}

function walkParts(p: GPart, out: GPart[] = []): GPart[] {
  out.push(p);
  for (const c of p.parts ?? []) walkParts(c, out);
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const tidy = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

async function syncGmail(token: string, files: SyncFile[]): Promise<string> {
  const seen = new Set<string>();
  const sections: string[] = [];
  for (const { kind, q, attachments, max } of GMAIL_QUERIES) {
    const list = await gget<{ messages?: { id: string }[] }>(`${GMAIL}/messages?maxResults=${max}&q=${encodeURIComponent(q)}`, token);
    const ids = (list.messages ?? []).map((m) => m.id).filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    const msgs = await Promise.all(
      ids.map((id) =>
        gget<{ id: string; internalDate?: string; payload?: GPart }>(`${GMAIL}/messages/${id}?format=full`, token).catch(() => null),
      ),
    );
    for (const m of msgs) {
      if (!m?.payload) continue;
      const header = (n: string) => m.payload!.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
      const subject = header("subject") || "(no subject)";
      const when = monthYear(new Date(Number(m.internalDate) || Date.parse(header("date")) || Date.now()));
      const parts = walkParts(m.payload);
      const decode = (p?: GPart) => (p?.body?.data ? Buffer.from(p.body.data, "base64url").toString("utf8") : "");
      const plain = decode(parts.find((p) => p.mimeType === "text/plain" && !p.filename));
      const html = plain ? "" : decode(parts.find((p) => p.mimeType === "text/html" && !p.filename));
      const body = tidy((plain || htmlToText(html)).replace(/\(?https?:\/\/[^\s)]+\)?/g, "").replace(/\[\s*\]/g, "")).slice(0, MAX_EMAIL_CHARS);
      const label = `Gmail: ${kind}, ${when}`;
      sections.push(`### ${label}\nSubject: ${subject}\nFrom: ${header("from")}\nTo: ${header("to")}\n\n${body}`);

      // Pay stubs and bills usually arrive as a PDF attachment; take the first one per message.
      if (!attachments || files.length >= MAX_FILES) continue;
      const att = parts.find(
        (p) => p.filename && p.body?.attachmentId && FILE_MIME.test(p.mimeType ?? "") && (p.body.size ?? 0) <= MAX_FILE_BYTES,
      );
      if (!att) continue;
      const a = await gget<{ data?: string }>(`${GMAIL}/messages/${m.id}/attachments/${att.body!.attachmentId}`, token).catch(
        () => null,
      );
      if (a?.data) files.push({ name: `${label} - ${att.filename}`, mime: att.mimeType!, data: Buffer.from(a.data, "base64url") });
    }
  }
  return sections.length ? `## Gmail (targeted searches: phone carrier, shipping address, phone purchase, streaming, offer letters, pay stubs, utility bills). Names on orders or bookings can belong to family members who share the account; the account owner is the Google profile name\n\n${sections.join("\n\n")}` : "";
}

// ---------- Drive ----------

async function syncDrive(token: string, files: SyncFile[]): Promise<string> {
  const nameQ = DRIVE_NAMES.map((n) => `name contains '${n}'`).join(" or ");
  const params = new URLSearchParams({
    q: `trashed = false and (${nameQ})`,
    orderBy: "modifiedTime desc",
    pageSize: "12",
    fields: "files(id,name,mimeType,modifiedTime,size)",
  });
  const list = await gget<{ files?: { id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }[] }>(
    `${DRIVE}/files?${params}`,
    token,
  );
  const docs: string[] = [];
  for (const f of list.files ?? []) {
    const label = `Drive: ${f.name}, modified ${monthYear(new Date(f.modifiedTime ?? Date.now()))}`;
    try {
      if (f.mimeType === GOOGLE_DOC) {
        const text = await (await gfetch(`${DRIVE}/files/${f.id}/export?mimeType=text/plain`, token)).text();
        docs.push(`### ${label}\n${tidy(text).slice(0, MAX_DOC_CHARS)}`);
      } else if (FILE_MIME.test(f.mimeType) && Number(f.size ?? 0) <= MAX_FILE_BYTES && files.length < MAX_FILES) {
        const data = Buffer.from(await (await gfetch(`${DRIVE}/files/${f.id}?alt=media`, token)).arrayBuffer());
        files.push({ name: `Drive: ${f.name}`, mime: f.mimeType, data });
      }
    } catch (e) {
      console.warn(`[formly] drive file skipped: ${(e as Error).message}`);
    }
  }
  return docs.length ? `## Google Drive documents\n\n${docs.join("\n\n")}` : "";
}

/**
 * Live Google sync, read-only and targeted: profile, emergency-contact candidates, a few Gmail searches,
 * and Drive files named like IDs/resumes/pay stubs. Google Docs come back as text; PDFs, images and
 * .docx come back in `files` for the caller to run through extractText. A scope the user didn't grant is skipped.
 */
export async function syncGoogle(
  userId: string,
  scopes: GoogleScope[],
): Promise<{ name: string; text: string; files: { name: string; mime: string; data: Buffer }[] }> {
  const token = await googleAccessToken(userId);
  const granted = new Set((getTokens(userId, "google")?.scopes ?? "").split(/\s+/));
  const account = googleConnection(userId)?.email ?? "";
  // Picker mode never reads Gmail or searches Drive, whatever the caller asked for.
  const allowed = new Set(googleSyncScopes());
  const files: SyncFile[] = [];
  const parts: string[] = [`Google account: ${account}`];
  const synced: GoogleScope[] = [];
  const failures: string[] = [];

  const run: Record<GoogleScope, () => Promise<string>> = {
    profile: () => syncProfile(token),
    contacts: () => syncContacts(token),
    gmail: () => syncGmail(token, files),
    drive: () => syncDrive(token, files),
  };
  for (const scope of GOOGLE_SYNC_SCOPES.filter((s) => scopes.includes(s) && allowed.has(s))) {
    // Profile still works with only some of its scopes (e.g. no birthday), so only require the first.
    const needed = scope === "profile" ? OAUTH_SCOPES.profile.slice(0, 1) : OAUTH_SCOPES[scope];
    if (granted.size > 1 && !needed.every((s) => granted.has(s))) {
      failures.push(`${LABELS[scope]}: not granted`);
      continue;
    }
    try {
      const text = await run[scope]();
      if (text) parts.push(text);
      synced.push(scope);
    } catch (e) {
      failures.push(`${LABELS[scope]}: ${(e as Error).message}`);
    }
  }
  if (failures.length) console.warn(`[formly] google sync skipped ${failures.join("; ")}`);
  if (synced.length === 0) throw new Error(`Nothing imported from Google (${failures.join("; ") || "no scopes"})`);
  return { name: `Google (${synced.map((s) => LABELS[s]).join(", ")})`, text: parts.join("\n\n"), files: files.slice(0, MAX_FILES) };
}

/** Run up to `limit` jobs at a time (file transcription goes to Gemini). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Sync + store: replaces every previous google source with one text source plus one source per
 * imported file. The caller rebuilds the twin. Returns per-file extraction errors.
 */
export async function importGoogle(userId: string, scopes: GoogleScope[]): Promise<{ errors: string[] }> {
  const started = Date.now();
  const sync = await syncGoogle(userId, scopes);
  const errors: string[] = [];
  const extracted = await pool(sync.files, 4, async (f) => {
    try {
      return { f, text: `From Google ${f.name}\n\n${await extractText(f.name, f.mime, f.data)}` };
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
      return null;
    }
  });

  const insert = db.prepare(
    "INSERT INTO sources (id, user_id, connector, name, mime, text, created_at) VALUES (?, ?, 'google', ?, ?, ?, ?)",
  );
  const now = Date.now();
  db.transaction(() => {
    // Wiped (or disconnected) while syncing: the user's data must not come back with a fresh created_at.
    if (wipedSince(userId, started) || !getTokens(userId, "google")) throw new WipedError();
    // Files picked in the Google Picker stay; they aren't part of what a sync re-reads.
    db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'google' AND name NOT LIKE 'Drive (picked): %'").run(userId);
    insert.run(nanoid(), userId, sync.name, "text/plain", sync.text, now);
    for (const x of extracted) if (x?.text) insert.run(nanoid(), userId, x.f.name, x.f.mime, x.text, now);
  })();
  return { errors };
}

// ---------- Google Picker (drive.file) ----------

const MAX_PICKED = 10;

/**
 * Import the files the user chose in the Google Picker. drive.file only reaches files the user picked for
 * this app, so the ids can't name anything else in their Drive. Google Docs come back as text, PDFs and
 * photos go through extractText. Each file is its own google source, labelled "Drive (picked): name".
 */
export async function importPickedFiles(userId: string, fileIds: string[]): Promise<{ added: number; errors: string[] }> {
  const started = Date.now();
  const token = await googleAccessToken(userId);
  const ids = [...new Set(fileIds.filter((id) => /^[\w-]{10,200}$/.test(id)))].slice(0, MAX_PICKED);
  const errors: string[] = [];
  const rows = await pool(ids, 4, async (id) => {
    try {
      const f = await gget<{ name: string; mimeType: string; size?: string; modifiedTime?: string }>(
        `${DRIVE}/files/${id}?fields=name,mimeType,size,modifiedTime`,
        token,
      );
      const label = `Drive (picked): ${f.name}`;
      if (f.mimeType === GOOGLE_DOC) {
        const text = await (await gfetch(`${DRIVE}/files/${id}/export?mimeType=text/plain`, token)).text();
        return { name: label, mime: "text/plain", text: `From Google ${label}\n\n${tidy(text).slice(0, MAX_DOC_CHARS)}` };
      }
      if (!FILE_MIME.test(f.mimeType)) throw new Error("Formly can read PDFs, photos, Word files and Google Docs");
      if (Number(f.size ?? 0) > MAX_FILE_BYTES) throw new Error(`larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
      const data = Buffer.from(await (await gfetch(`${DRIVE}/files/${id}?alt=media`, token)).arrayBuffer());
      return { name: label, mime: f.mimeType, text: `From Google ${label}\n\n${await extractText(f.name, f.mimeType, data)}` };
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message}`);
      return null;
    }
  });
  const insert = db.prepare(
    "INSERT INTO sources (id, user_id, connector, name, mime, text, created_at) VALUES (?, ?, 'google', ?, ?, ?, ?)",
  );
  let added = 0;
  db.transaction(() => {
    if (wipedSince(userId, started) || !getTokens(userId, "google")) throw new WipedError();
    for (const r of rows) {
      if (!r?.text) continue;
      // Picking the same file twice replaces it.
      db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'google' AND name = ?").run(userId, r.name);
      insert.run(nanoid(), userId, r.name, r.mime, r.text, Date.now());
      added++;
    }
  })();
  return { added, errors };
}
