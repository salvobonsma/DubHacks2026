import { nanoid } from "nanoid";
import { db } from "./db";
import { extractText } from "./extract";
import { deleteTokens, getTokens, saveTokens, updateTokens } from "./oauth";
import { WipedError, wipedSince } from "./wipes";

/** Microsoft identity platform v2, "common" tenant so both personal and work accounts can sign in. */
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const MICROSOFT_SCOPES = "offline_access openid email profile User.Read Files.Read Mail.Read";

export const MICROSOFT_SYNC_SCOPES = ["profile", "onedrive", "outlook"] as const;
export type MicrosoftScope = (typeof MICROSOFT_SYNC_SCOPES)[number];
const LABELS: Record<MicrosoftScope, string> = { profile: "Profile", onedrive: "OneDrive", outlook: "Outlook" };

type SyncFile = { name: string; mime: string; data: Buffer };
type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

export function microsoftConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function microsoftConnection(userId: string): { email: string } | null {
  const t = getTokens(userId, "microsoft");
  return t ? { email: t.account } : null;
}

/** Cookie holding the pending state, binding a sign-in to the browser that started it (as for Google). */
export const MICROSOFT_STATE_COOKIE = "formly_microsoft_state";

export function microsoftRedirectUri(origin: string) {
  return `${origin}/api/connectors/microsoft/callback`;
}

/** Consent URL for the start route; state + PKCE challenge come from lib/oauth. */
export function microsoftAuthUrl(origin: string, state: string, challenge: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    response_type: "code",
    response_mode: "query",
    redirect_uri: microsoftRedirectUri(origin),
    scope: MICROSOFT_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTHORITY}/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      scope: MICROSOFT_SCOPES,
      ...body,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    // error_description is Microsoft's own message (no secrets); drop the trace/correlation IDs it appends.
    const message = json.error_description?.split(/\s*Trace ID:/)[0];
    throw new Error(message || json.error || `token request failed (${res.status})`);
  }
  return json;
}

/** Callback step: swap the auth code for tokens, look up the account, and store both. */
export async function connectMicrosoft(userId: string, code: string, verifier: string, origin: string) {
  const started = Date.now();
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: microsoftRedirectUri(origin),
  });
  const me = await graphJson<GraphUser>("/me?$select=displayName,mail,userPrincipalName", t.access_token);
  // Deleted their data while signing in: don't keep a grant they just wiped.
  if (wipedSince(userId, started)) throw new WipedError();
  saveTokens(userId, "microsoft", {
    account: me.mail ?? me.userPrincipalName ?? me.displayName ?? "Microsoft account",
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_in: t.expires_in,
    scopes: t.scope ?? MICROSOFT_SCOPES,
  });
}

/** A valid Graph access token, refreshed (and the rotated refresh token saved) when close to expiry. */
export async function microsoftAccessToken(userId: string): Promise<string> {
  const t = getTokens(userId, "microsoft");
  if (!t) throw new Error("Microsoft isn't connected");
  if (t.expires_at - 60_000 > Date.now()) return t.access_token;
  if (!t.refresh_token) throw new Error("Microsoft sign-in expired, connect again");
  let fresh: TokenResponse;
  try {
    fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  } catch (e) {
    // A revoked or expired grant can't come back; drop it so the tile offers Connect again.
    deleteTokens(userId, "microsoft");
    throw new Error(`Microsoft sign-in expired, connect again (${(e as Error).message})`);
  }
  // Update only: a grant deleted while the refresh ran stays deleted.
  const kept = updateTokens(userId, "microsoft", {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token,
    expires_in: fresh.expires_in,
    scopes: fresh.scope ?? t.scopes,
  });
  if (!kept) throw new Error("Microsoft isn't connected");
  return fresh.access_token;
}

async function graph(path: string, token: string, headers: Record<string, string> = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Microsoft Graph ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  return res;
}

async function graphJson<T>(path: string, token: string, headers?: Record<string, string>): Promise<T> {
  return (await (await graph(path, token, headers)).json()) as T;
}

interface GraphUser {
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName?: string;
  mobilePhone?: string;
  businessPhones?: string[];
  jobTitle?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  birthday?: string;
}

interface DriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
}

interface Message {
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { content?: string };
}

const monthYear = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "undated";

// Same document names the Google Drive import looks for.
const ONEDRIVE_QUERIES = ["resume", "CV", "license", "passport", "pay stub", "lease"];
// Only formats extractText can read; anything else in the search results is skipped.
const ONEDRIVE_EXT = /\.(pdf|docx|png|jpe?g|webp|heic|txt|md)$/i;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** KQL for Outlook $search, mirroring the Gmail queries (single words only, so no phrase quoting). */
function outlookQueries(): { label: string; q: string }[] {
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  return [
    {
      label: "Offer letter / employment",
      q: "(subject:offer AND subject:letter) OR (subject:employment AND subject:verification)",
    },
    { label: "Pay stub", q: "(subject:pay AND subject:stub) OR subject:payslip OR (subject:earnings AND subject:statement)" },
    { label: "Utility bill", q: "(subject:statement OR subject:bill) AND (electric OR water OR internet OR utility)" },
    { label: "Receipt", q: `(subject:order OR subject:receipt) AND received>=${yearAgo}` },
  ];
}

async function syncProfile(token: string): Promise<string> {
  const fields =
    "displayName,givenName,surname,mail,userPrincipalName,mobilePhone,businessPhones,jobTitle,streetAddress,city,state,postalCode,country";
  const me = await graphJson<GraphUser>(`/me?$select=${fields}`, token);
  // Birthday is only readable on some account types; skip it quietly when Graph refuses.
  const birthday = await graphJson<GraphUser>("/me?$select=birthday", token)
    .then((u) => (u.birthday && !u.birthday.startsWith("0001") ? u.birthday.slice(0, 10) : undefined))
    .catch(() => undefined);
  const address = [me.streetAddress, me.city, me.state, me.postalCode, me.country].filter(Boolean).join(", ");
  const rows: [string, string | undefined][] = [
    ["Name", me.displayName],
    ["First name", me.givenName],
    ["Last name", me.surname],
    ["Email", me.mail ?? me.userPrincipalName],
    ["Mobile phone", me.mobilePhone],
    ["Work phone", me.businessPhones?.[0]],
    ["Job title", me.jobTitle],
    ["Address", address || undefined],
    ["Date of birth", birthday],
  ];
  return `## Microsoft profile\n${rows.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`;
}

async function syncOneDrive(token: string): Promise<{ text: string; files: SyncFile[] }> {
  const seen = new Map<string, DriveItem>();
  for (const q of ONEDRIVE_QUERIES) {
    const res = await graphJson<{ value: DriveItem[] }>(
      `/me/drive/root/search(q='${encodeURIComponent(q)}')?$select=id,name,size,lastModifiedDateTime,file&$top=10`,
      token,
    );
    for (const item of res.value) if (item.file && ONEDRIVE_EXT.test(item.name)) seen.set(item.id, item);
  }
  const newest = [...seen.values()]
    .filter((i) => (i.size ?? 0) <= MAX_FILE_BYTES)
    .sort((a, b) => (b.lastModifiedDateTime ?? "").localeCompare(a.lastModifiedDateTime ?? ""))
    .slice(0, MAX_FILES);

  const files: SyncFile[] = [];
  for (const item of newest) {
    // /content redirects to a pre-signed download URL, which fetch follows.
    const res = await graph(`/me/drive/items/${item.id}/content`, token).catch(() => null);
    if (!res) continue;
    files.push({
      name: item.name,
      mime: item.file?.mimeType ?? "",
      data: Buffer.from(await res.arrayBuffer()),
    });
  }
  const list = newest.map((i) => `- OneDrive: ${i.name}, ${monthYear(i.lastModifiedDateTime)}`).join("\n");
  return { text: `## OneDrive documents\n${list || "- No matching documents found"}`, files };
}

async function syncOutlook(token: string): Promise<string> {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const { label, q } of outlookQueries()) {
    // Built by hand so the "$" in the OData keys isn't percent-encoded; only the KQL value is.
    const params = `$search=${encodeURIComponent(`"${q}"`)}&$top=5&$select=id,subject,from,receivedDateTime,body`;
    // Search results come back newest first; ask for plain-text bodies instead of HTML.
    const res = await graphJson<{ value: (Message & { id: string })[] }>(`/me/messages?${params}`, token, {
      Prefer: 'outlook.body-content-type="text"',
    });
    for (const m of res.value) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const from = m.from?.emailAddress;
      const body = (m.body?.content ?? "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
      parts.push(
        `### Outlook: ${label}, ${monthYear(m.receivedDateTime)}\nSubject: ${m.subject ?? "(no subject)"}\nFrom: ${
          from?.name ?? ""
        } <${from?.address ?? ""}>\n\n${body}`,
      );
    }
  }
  return `## Outlook emails\n${parts.join("\n\n") || "No matching emails found"}`;
}

/** Pull identity, documents and targeted emails from Microsoft Graph for the given scopes. */
export async function syncMicrosoft(
  userId: string,
  scopes: MicrosoftScope[],
): Promise<{ name: string; text: string; files: SyncFile[] }> {
  const token = await microsoftAccessToken(userId);
  const account = microsoftConnection(userId)?.email ?? "Microsoft account";
  const parts = [`Microsoft account: ${account}`];
  let files: SyncFile[] = [];
  if (scopes.includes("profile")) parts.push(await syncProfile(token));
  if (scopes.includes("onedrive")) {
    const drive = await syncOneDrive(token);
    parts.push(drive.text);
    files = drive.files;
  }
  if (scopes.includes("outlook")) parts.push(await syncOutlook(token));
  return { name: `Microsoft (${scopes.map((s) => LABELS[s]).join(", ")})`, text: parts.join("\n\n"), files };
}

/**
 * Sync and store: replaces every previous microsoft source with one text source plus one source per
 * OneDrive file (run through extractText). The caller rebuilds the twin.
 */
export async function importMicrosoft(userId: string, scopes: MicrosoftScope[]) {
  const started = Date.now();
  const { name, text, files } = await syncMicrosoft(userId, scopes);
  const rows: { name: string; mime: string | null; text: string }[] = [{ name, mime: "text/plain", text }];
  for (const f of files) {
    try {
      const body = await extractText(f.name, f.mime, f.data);
      rows.push({ name: `OneDrive: ${f.name}`, mime: f.mime || null, text: `OneDrive: ${f.name}\n\n${body}` });
    } catch {
      // One unreadable file shouldn't sink the whole import.
    }
  }
  const insert = db.prepare(
    "INSERT INTO sources (id, user_id, connector, name, mime, text, created_at) VALUES (?, ?, 'microsoft', ?, ?, ?, ?)",
  );
  db.transaction(() => {
    // Wiped (or disconnected) while syncing: the user's data must not come back with a fresh created_at.
    if (wipedSince(userId, started) || !getTokens(userId, "microsoft")) throw new WipedError();
    db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'microsoft'").run(userId);
    for (const r of rows) insert.run(nanoid(), userId, r.name, r.mime, r.text, Date.now());
  })();
}
