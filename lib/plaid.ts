import { nanoid } from "nanoid";
import { db } from "./db";
import type { FormField } from "./types";
import { WipedError, wipedSince } from "./wipes";

/**
 * Bank connector via Plaid (REST over fetch, no SDK). Plaid Link runs in the browser (components/ConnectBank.tsx);
 * this module makes the link token, swaps Link's public token for an access token, and turns /identity/get and
 * /transactions/sync into two plain-text sources:
 *   - the account owner's names, emails, phones and addresses (plus account names with the last 4 digits only);
 *   - a summary of recurring charges and phone-carrier bills from the last 90 days, as evidence for the plan and
 *     carrier suggestions. No other transactions, no balances.
 * Full account and routing numbers never become a source (so they never reach Gemini): plaidBankFill reads them
 * from /auth/get at fill time and maps them onto bank fields in code.
 *
 * Env: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV ("sandbox" default, "production" for real banks).
 */

export type PlaidEnv = "sandbox" | "production";
export function plaidEnv(): PlaidEnv {
  return process.env.PLAID_ENV?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim());
}

/** Where Plaid sends the user back after an OAuth bank (Chase, Bank of America…). Register it in the Plaid dashboard. */
export const plaidRedirectUri = (origin: string) => `${origin}/formly/plaid-oauth`;

const DAYS = 90;
const MAX_RECURRING = 15;

/**
 * One bank connection (Plaid Item) per visitor; connecting another bank replaces it. Created here (like the OAuth
 * tables in lib/oauth.ts); user_id + created_at let lib/user.ts wipe it and the TTL purge expire it.
 */
export function plaidTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plaid_items (
      user_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      institution TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}
plaidTables();

function getItem(userId: string): { item_id: string; access_token: string; institution: string | null } | null {
  return (
    (db.prepare("SELECT item_id, access_token, institution FROM plaid_items WHERE user_id = ?").get(userId) as
      | { item_id: string; access_token: string; institution: string | null }
      | undefined) ?? null
  );
}

export function plaidConnection(userId: string): { institution: string } | null {
  const item = getItem(userId);
  return item ? { institution: item.institution || "Your bank" } : null;
}

// ---------- REST ----------

/** A Plaid API error. message is Plaid's user-facing display_message when it has one; never includes credentials. */
export class PlaidError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly type: string,
  ) {
    super(message);
  }
}

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${plaidEnv()}.plaid.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Plaid-Version": "2020-09-14" },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID?.trim(), secret: process.env.PLAID_SECRET?.trim(), ...body }),
    signal: AbortSignal.timeout(30000),
  });
  const json = (await res.json().catch(() => null)) as
    | (T & { error_code?: string; error_type?: string; error_message?: string; display_message?: string | null })
    | null;
  if (!res.ok || !json) {
    const code = json?.error_code ?? `HTTP_${res.status}`;
    let message = json?.display_message || json?.error_message || res.statusText || "Plaid request failed";
    if (code === "INVALID_API_KEYS") message = `Plaid rejected the keys. Check PLAID_SECRET is the ${plaidEnv()} secret (PLAID_ENV).`;
    throw new PlaidError(message.slice(0, 200), code, json?.error_type ?? "API_ERROR");
  }
  return json;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Link token for this visitor. redirect_uri (for OAuth banks on mobile web) is sent on https origins, and on
 * localhost in sandbox only; Plaid refuses one that isn't registered in the dashboard, so then this retries
 * without it (non-OAuth banks still work, OAuth banks fall back to Link's desktop popup).
 */
export async function createLinkToken(userId: string, origin: string): Promise<{ link_token: string; expiration: string }> {
  let redirect: string | null = null;
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" || (LOOPBACK.has(url.hostname) && plaidEnv() === "sandbox")) redirect = plaidRedirectUri(origin);
  } catch {}
  const body: Record<string, unknown> = {
    client_name: "Formly",
    language: "en",
    country_codes: ["US"],
    // The anonymous formly_uid: random, no personal data in it.
    user: { client_user_id: userId },
    products: ["identity", "transactions"],
    // Consent for Auth up front; Plaid only bills it when a form with bank fields calls /auth/get.
    additional_consented_products: ["auth"],
    transactions: { days_requested: DAYS },
    ...(redirect ? { redirect_uri: redirect } : {}),
  };
  for (let attempt = 0; ; attempt++) {
    try {
      return await plaid<{ link_token: string; expiration: string }>("/link/token/create", body);
    } catch (e) {
      // Drop an optional field Plaid refused (unregistered redirect URI, Auth not on the plan) and try again.
      const refused = e instanceof PlaidError && attempt < 2 ? optionalFieldRefused(e, body) : null;
      if (!refused) throw e;
      console.warn(`[formly] plaid link token: retrying without ${refused} (${(e as PlaidError).code})`);
      delete body[refused];
    }
  }
}

function optionalFieldRefused(e: PlaidError, body: Record<string, unknown>): string | null {
  const msg = e.message.toLowerCase();
  if ("redirect_uri" in body && msg.includes("redirect")) return "redirect_uri";
  if ("additional_consented_products" in body && /consented|\bauth\b/.test(msg)) return "additional_consented_products";
  if ("redirect_uri" in body && e.code === "INVALID_FIELD") return "redirect_uri";
  return null;
}

/** Swap Link's public token for an access token and store it, replacing (and removing at Plaid) any earlier bank. */
export async function exchangePublicToken(userId: string, publicToken: string, institution: string | null): Promise<void> {
  const started = Date.now();
  const res = await plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
  const old = getItem(userId);
  // Deleted their data while Link was open: drop the new Item instead of saving it.
  if (wipedSince(userId, started)) {
    void itemRemove(res.access_token);
    throw new WipedError();
  }
  db.prepare(
    `INSERT INTO plaid_items (user_id, item_id, access_token, institution, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET item_id = excluded.item_id, access_token = excluded.access_token,
       institution = excluded.institution`,
  ).run(userId, res.item_id, res.access_token, institution?.slice(0, 80) || null, Date.now());
  pending.delete(userId);
  if (old && old.item_id !== res.item_id) void itemRemove(old.access_token);
}

async function itemRemove(accessToken: string): Promise<void> {
  try {
    await plaid("/item/remove", { access_token: accessToken });
  } catch (e) {
    console.warn(`[formly] plaid item remove failed: ${(e as PlaidError).code ?? (e as Error).message}`);
  }
}

/** Disconnect: /item/remove at Plaid, forget the token. The caller removes the plaid sources and rebuilds the twin. */
export async function removePlaid(userId: string): Promise<void> {
  const removing = removePlaidItems(userId);
  db.prepare("DELETE FROM plaid_items WHERE user_id = ?").run(userId);
  await removing;
}

/**
 * For lib/user.ts wipeUser ("Delete my data", End and wipe, TTL purge). Reads the tokens and forgets the pending
 * owner choice synchronously, so call it before the rows are deleted (wipeUser deletes and counts them); the
 * /item/remove calls finish in the background.
 */
export function removePlaidItems(userId: string): Promise<void> {
  const rows = db.prepare("SELECT access_token FROM plaid_items WHERE user_id = ?").all(userId) as { access_token: string }[];
  pending.delete(userId);
  if (!rows.length || !plaidConfigured()) return Promise.resolve();
  return Promise.all(rows.map((r) => itemRemove(r.access_token))).then(() => undefined);
}

// ---------- Identity ----------

export interface PlaidAddress {
  data: { street?: string | null; city?: string | null; region?: string | null; postal_code?: string | null; country?: string | null };
  primary?: boolean;
}
export interface PlaidOwner {
  names: string[];
  emails: { data: string; primary?: boolean; type?: string }[];
  phone_numbers: { data: string; primary?: boolean; type?: string }[];
  addresses: PlaidAddress[];
}
export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  owners?: PlaidOwner[];
}
export interface PlaidIdentityResponse {
  accounts: PlaidAccount[];
  item?: { institution_id?: string | null };
}

/** One person on the connected accounts (joint accounts have several), merged across accounts. */
export interface BankOwner {
  name: string;
  names: string[];
  emails: { value: string; primary: boolean; type: string }[];
  phones: { value: string; primary: boolean; type: string }[];
  addresses: { value: string; primary: boolean }[];
  accounts: string[];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s'-]/g, " ")
    .split(/[\s'-]+/)
    .filter((w) => w.length > 1);

/**
 * Same person? The shorter name's first and last words must both appear in the other ("Alex Chen" matches
 * "ALEX J CHEN" and "Chen, Alex"; "Maria Chen" does not).
 */
export function sameName(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)].sort((p, q) => p.length - q.length);
  if (!x.length) return false;
  const other = new Set(y);
  return other.has(x[0]) && other.has(x[x.length - 1]);
}

const accountLabel = (a: PlaidAccount) =>
  `${a.official_name || a.name} (${a.subtype || a.type})${a.mask ? ` ending ${a.mask}` : ""}`;

function formatAddress(a: PlaidAddress["data"]): string {
  const cityLine = [a.city, [a.region, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [a.street, cityLine, a.country].filter(Boolean).join(", ");
}

/** US numbers as (206) 555-0134; anything else as given. */
function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : p.trim();
}

/** The distinct people on the accounts, each with every detail the bank has for them. */
export function bankOwners(identity: PlaidIdentityResponse): BankOwner[] {
  const out: BankOwner[] = [];
  for (const acct of identity.accounts ?? []) {
    for (const o of acct.owners ?? []) {
      const names = (o.names ?? []).map((n) => n.trim()).filter(Boolean);
      if (!names.length) continue;
      let person = out.find((p) => names.some((n) => p.names.some((m) => sameName(n, m))));
      if (!person) {
        person = { name: names[0], names: [], emails: [], phones: [], addresses: [], accounts: [] };
        out.push(person);
      }
      const p = person;
      for (const n of names) if (!p.names.includes(n)) p.names.push(n);
      for (const e of o.emails ?? []) {
        const value = e.data?.trim();
        if (value && !p.emails.some((x) => x.value.toLowerCase() === value.toLowerCase()))
          p.emails.push({ value, primary: !!e.primary, type: e.type ?? "" });
      }
      for (const ph of o.phone_numbers ?? []) {
        const value = ph.data ? formatPhone(ph.data) : "";
        if (value && !p.phones.some((x) => x.value === value)) p.phones.push({ value, primary: !!ph.primary, type: ph.type ?? "" });
      }
      for (const a of o.addresses ?? []) {
        const value = a.data ? formatAddress(a.data) : "";
        if (value && !p.addresses.some((x) => x.value === value)) p.addresses.push({ value, primary: !!a.primary });
      }
      const label = accountLabel(acct);
      if (!p.accounts.includes(label)) p.accounts.push(label);
    }
  }
  // Primary details first, so the fill picks the bank's own current choice.
  for (const p of out) for (const list of [p.emails, p.phones, p.addresses]) list.sort((a, b) => Number(b.primary) - Number(a.primary));
  return out;
}

const tag = (primary: boolean, type: string) => {
  // Plaid's email "type" is often "primary" itself; don't say it twice.
  const t = [type && type !== "other" && type !== "primary" ? type : "", primary ? "primary" : ""].filter(Boolean).join(", ");
  return t ? ` (${t})` : "";
};

/** One owner as labelled source text. Only account names and their last 4 digits; never full numbers. */
export function formatOwner(owner: BankOwner, institution: string): string {
  const lines = [`## Bank account owner (${institution}, via Plaid Identity)`, `Name: ${owner.name}`];
  for (const n of owner.names.slice(1)) lines.push(`Also listed as: ${n}`);
  for (const e of owner.emails) lines.push(`Email${tag(e.primary, e.type)}: ${e.value}`);
  for (const p of owner.phones) lines.push(`Phone${tag(p.primary, p.type)}: ${p.value}`);
  for (const a of owner.addresses) lines.push(`Address${a.primary ? " (primary)" : ""}: ${a.value}`);
  if (owner.accounts.length) lines.push(`Bank accounts at ${institution}: ${owner.accounts.join("; ")}`);
  return lines.join("\n");
}

// ---------- Transactions ----------

export interface PlaidTransaction {
  transaction_id?: string;
  account_id?: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string | null;
  pending?: boolean;
  iso_currency_code?: string | null;
  personal_finance_category?: { primary?: string; detailed?: string } | null;
  counterparties?: { name?: string; type?: string }[] | null;
}

// Most specific first: "Metro by T-Mobile" before "T-Mobile", "Xfinity Mobile" before plain Comcast.
const CARRIERS: [string, RegExp][] = [
  ["Metro by T-Mobile", /metro ?(by ?t-?mobile|pcs)/i],
  ["T-Mobile", /t-?mobile|tmobile/i],
  ["Verizon", /verizon|vzw/i],
  ["AT&T", /\bat ?& ?t\b|\batt\b(?! ?park)/i],
  ["Mint Mobile", /mint ?mobile/i],
  ["Visible", /\bvisible\b/i],
  ["Google Fi", /google ?\*?fi\b|\bgoogle fi/i],
  ["Cricket Wireless", /cricket/i],
  ["US Mobile", /\bus ?mobile\b/i],
  ["Boost Mobile", /boost ?mobile/i],
  ["Xfinity Mobile", /xfinity ?mobile/i],
  ["Spectrum Mobile", /spectrum ?mobile/i],
  ["Consumer Cellular", /consumer ?cellular/i],
  ["Straight Talk", /straight ?talk/i],
  ["Tracfone", /tracfone/i],
];
const STREAMING =
  /netflix|hulu|disney|spotify|apple\.com\/bill|apple (one|music|tv)|youtube|hbo|\bmax\b|paramount|peacock|prime video|amazon prime|audible|sirius|tidal|pandora|crunchyroll|espn|sling|fubo|discovery\+/i;
const KIND: [RegExp, string][] = [
  [/ENTERTAINMENT_(TV_AND_MOVIES|MUSIC_AND_AUDIO)/, "streaming"],
  [/RENT_AND_UTILITIES_INTERNET_AND_CABLE/, "internet"],
  [/RENT_AND_UTILITIES_(GAS_AND_ELECTRICITY|WATER|SEWAGE|OTHER_UTILITIES)/, "utility"],
  [/INSURANCE/, "insurance"],
  [/RENT_AND_UTILITIES_RENT/, "rent"],
  [/PERSONAL_CARE_GYMS|FITNESS/, "gym"],
];
/** Money moved between people or accounts, pay and fees: never a "recurring merchant", and may name other people. */
const SKIP_PRIMARY = /^(TRANSFER_IN|TRANSFER_OUT|INCOME|LOAN_PAYMENTS|BANK_FEES)$/;
const SKIP_NAME = /zelle|venmo|cash ?app|paypal|\batm\b|withdrawal|deposit|transfer|payroll|interest|refund/i;

const carrierOf = (s: string) => CARRIERS.find(([, re]) => re.test(s))?.[0] ?? null;
const money = (n: number) => `$${n.toFixed(2)}`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

interface Recurring {
  merchant: string;
  kind: string | null;
  carrier: boolean;
  amounts: number[];
  months: Set<string>;
  last: string;
}

/**
 * The last 90 days as evidence, not a statement: phone-carrier charges plus merchants charged in at least two
 * different months (streaming services also count once, they're the plan suggestion's evidence). Purchases, pay,
 * transfers (which can name other people), balances and account numbers are all left out. Returns "" when
 * there's nothing worth saying.
 */
export function summarizeTransactions(txs: PlaidTransaction[], institution: string, now = Date.now()): string {
  const since = new Date(now - DAYS * 86_400_000).toISOString().slice(0, 10);
  const groups = new Map<string, Recurring>();
  for (const t of txs) {
    // Plaid amounts are positive for money leaving the account.
    if (t.pending || !(t.amount > 0) || !t.date || t.date < since) continue;
    if (t.iso_currency_code && t.iso_currency_code !== "USD") continue;
    const raw = `${t.merchant_name ?? ""} ${t.name ?? ""}`;
    const carrier = carrierOf(raw);
    const pfc = t.personal_finance_category;
    const phoneBill = pfc?.detailed === "RENT_AND_UTILITIES_TELEPHONE";
    if (!carrier && !phoneBill && (SKIP_PRIMARY.test(pfc?.primary ?? "") || SKIP_NAME.test(raw))) continue;
    const merchant =
      carrier ||
      t.merchant_name?.trim() ||
      t.counterparties?.find((c) => c.type === "merchant" && c.name)?.name?.trim() ||
      // Unenriched descriptors ("POS DEBIT 0423 SQ *JOES") only when they're clearly a streaming service.
      (STREAMING.test(t.name) ? t.name.replace(/[*#].*$|\d{3,}.*$/g, "").trim() : null);
    if (!merchant) continue;
    const kind = carrier || phoneBill ? "phone" : STREAMING.test(raw) ? "streaming" : (KIND.find(([re]) => re.test(pfc?.detailed ?? ""))?.[1] ?? null);
    const key = merchant.toLowerCase();
    const g = groups.get(key) ?? { merchant, kind, carrier: !!(carrier || phoneBill), amounts: [], months: new Set<string>(), last: "" };
    g.amounts.push(t.amount);
    g.months.add(t.date.slice(0, 7));
    if (t.date > g.last) g.last = t.date;
    groups.set(key, g);
  }

  const all = [...groups.values()];
  const carriers = all.filter((g) => g.carrier).sort((a, b) => b.last.localeCompare(a.last));
  const recurring = all
    .filter((g) => !g.carrier && (g.months.size >= 2 || g.kind === "streaming"))
    .sort((a, b) => Number(b.kind === "streaming") - Number(a.kind === "streaming") || b.months.size - a.months.size || b.last.localeCompare(a.last))
    .slice(0, MAX_RECURRING);
  if (!carriers.length && !recurring.length) return "";

  const describe = (g: Recurring) => {
    const per = g.months.size >= 2 ? `${money(median(g.amounts))} a month` : money(median(g.amounts));
    const seen = g.months.size >= 2 ? `charged in ${g.months.size} different months` : `charged ${g.amounts.length === 1 ? "once" : `${g.amounts.length} times`}`;
    return `${per}, ${seen}, last on ${g.last}`;
  };
  const lines = [
    `## Bank: recurring charges (${institution}, via Plaid, last ${DAYS} days)`,
    "Summary only: recurring charges and phone bills. No other transactions, balances or account numbers.",
  ];
  if (carriers.length) {
    lines.push("Phone carrier charges (evidence of the current carrier):");
    for (const g of carriers) lines.push(`- ${g.merchant}: ${describe(g)}`);
  }
  if (recurring.length) {
    lines.push("Recurring charges:");
    for (const g of recurring) lines.push(`- ${g.merchant}${g.kind ? ` (${g.kind})` : ""}: ${describe(g)}`);
  }
  return lines.join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Everything /transactions/sync has for the Item. Right after Link the history is still loading (NOT_READY, then
 * INITIAL_UPDATE_COMPLETE for ~30 days, then HISTORICAL_UPDATE_COMPLETE): poll for up to ~25 s and use what's there.
 */
async function recentTransactions(accessToken: string): Promise<PlaidTransaction[]> {
  type Page = { added: PlaidTransaction[]; has_more: boolean; next_cursor: string; transactions_update_status?: string };
  const added: PlaidTransaction[] = [];
  const deadline = Date.now() + 25_000;
  let cursor: string | undefined;
  for (let pages = 0; pages < 30; pages++) {
    let page: Page;
    try {
      page = await plaid<Page>("/transactions/sync", { access_token: accessToken, count: 500, ...(cursor ? { cursor } : {}) });
    } catch (e) {
      if (e instanceof PlaidError && e.code === "PRODUCT_NOT_READY" && Date.now() < deadline) {
        await sleep(2500);
        continue;
      }
      throw e;
    }
    added.push(...page.added);
    cursor = page.next_cursor;
    if (page.has_more) continue;
    const status = page.transactions_update_status;
    const done = status === "HISTORICAL_UPDATE_COMPLETE" || (!status && added.length > 0);
    if (done || Date.now() > deadline) break;
    await sleep(2500);
  }
  return added;
}

// ---------- Import ----------

/** The "Name: …" line inside a source's `## heading` section. */
function nameIn(text: string, heading: string): string | null {
  const at = text.indexOf(heading);
  if (at < 0) return null;
  const section = text.slice(at).split(/\n## /)[0];
  return section.match(/^Name: (.+)$/m)?.[1].trim() || null;
}

/** The Google profile name, the identity every other source is anchored on (lib/google.ts writes it). */
function profileName(userId: string): string | null {
  const rows = db.prepare("SELECT text FROM sources WHERE user_id = ? AND connector = 'google'").all(userId) as { text: string }[];
  for (const r of rows) {
    const name = nameIn(r.text, "## Google profile");
    if (name) return name;
  }
  return null;
}

interface Pending {
  owners: BankOwner[];
  institution: string;
  transactions: string;
  started: number;
}
// Read from the bank, waiting for "which of these is you?". In memory: it's seconds-to-minutes old and
// re-reading costs nothing but another sync. Survives hot reload like the wipe markers.
const store = globalThis as unknown as { __formlyPlaidPending?: Map<string, Pending> };
const pending = (store.__formlyPlaidPending ??= new Map<string, Pending>());
const PENDING_TTL_MS = 15 * 60_000;

export type PlaidImport =
  | { status: "imported"; owner: string | null; institution: string; errors: string[] }
  | { status: "choose"; owners: string[]; profileName: string | null; institution: string };

/** The owner choice still waiting for this visitor, if any. */
export function pendingChoice(userId: string): { owners: string[]; profileName: string | null; institution: string } | null {
  const p = pending.get(userId);
  if (!p || Date.now() - p.started > PENDING_TTL_MS || !getItem(userId)) return null;
  return { owners: p.owners.map((o) => o.name), profileName: profileName(userId), institution: p.institution };
}

/**
 * Read the bank and write its sources. Identity anchoring: the owner whose name matches the Google profile is
 * "you"; with no Google profile a single owner is. Anything else (a joint account, a name that doesn't match)
 * comes back as status "choose" and nothing is written until choosePlaidOwner. The caller rebuilds the twin.
 */
export async function importPlaid(userId: string): Promise<PlaidImport> {
  const started = Date.now();
  const item = getItem(userId);
  if (!item) throw new Error("Connect your bank first");
  const institution = item.institution || "your bank";
  const errors: string[] = [];
  const [identity, txs] = await Promise.all([
    plaid<PlaidIdentityResponse>("/identity/get", { access_token: item.access_token }).catch((e: Error) => {
      errors.push(`Identity: ${e.message}`);
      return null;
    }),
    recentTransactions(item.access_token).catch((e: Error) => {
      errors.push(`Transactions: ${e.message}`);
      return [] as PlaidTransaction[];
    }),
  ]);
  if (!identity && !txs.length) throw new Error(errors.join("; ") || "Nothing came back from your bank");
  if (errors.length) console.warn(`[formly] plaid import partial: ${errors.join("; ")}`);

  const owners = identity ? bankOwners(identity) : [];
  const transactions = summarizeTransactions(txs, institution);
  const anchor = profileName(userId);
  const matching = anchor ? owners.filter((o) => o.names.some((n) => sameName(n, anchor))) : owners;
  if (owners.length && matching.length !== 1) {
    pending.set(userId, { owners, institution, transactions, started });
    return { status: "choose", owners: owners.map((o) => o.name), profileName: anchor, institution };
  }
  const owner = matching[0] ?? null;
  saveSources(userId, started, owner, institution, transactions);
  return { status: "imported", owner: owner?.name ?? null, institution, errors };
}

/**
 * Answer to "which of these is you?": an index into the owners, or null for "none of these", which disconnects
 * the bank (Formly never mixes two people's data). The caller rebuilds the twin when it returns imported.
 */
export async function choosePlaidOwner(userId: string, index: number | null): Promise<PlaidImport | { status: "removed" }> {
  const p = pending.get(userId);
  if (!p || Date.now() - p.started > PENDING_TTL_MS || !getItem(userId)) throw new Error("That bank connection expired. Connect your bank again.");
  if (index === null) {
    await removePlaid(userId);
    return { status: "removed" };
  }
  const owner = p.owners[index];
  if (!owner) throw new Error("Pick one of the names shown");
  pending.delete(userId);
  saveSources(userId, p.started, owner, p.institution, p.transactions);
  return { status: "imported", owner: owner.name, institution: p.institution, errors: [] };
}

function saveSources(userId: string, started: number, owner: BankOwner | null, institution: string, transactions: string) {
  const insert = db.prepare(
    "INSERT INTO sources (id, user_id, connector, name, mime, text, created_at) VALUES (?, ?, 'plaid', ?, 'text/plain', ?, ?)",
  );
  const now = Date.now();
  db.transaction(() => {
    // Wiped or disconnected while the bank was being read: don't write it back.
    if (wipedSince(userId, started) || !getItem(userId)) throw new WipedError();
    db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'plaid'").run(userId);
    if (owner) insert.run(nanoid(), userId, `Bank: ${institution} (account owner)`, formatOwner(owner, institution), now);
    if (transactions) insert.run(nanoid(), userId, `Bank: ${institution} (recurring charges, ${DAYS} days)`, transactions, now);
  })();
}

// ---------- Bank fields (AutoPay) ----------

export type BankFieldKind = "routing" | "account" | "account_type" | "bank_name" | "holder";

const BANK_CONTEXT = /\bbank|auto ?pay|checking|savings|\bach\b|direct debit|e-?check/i;

/**
 * Which bank detail a form field asks for, or null. Needs bank context in the label or section, so a carrier's
 * "Account number" (number transfer) is never mistaken for a bank account.
 */
export function bankFieldKind(f: Pick<FormField, "label" | "section">): BankFieldKind | null {
  const ctx = `${f.section ?? ""} ${f.label}`;
  if (!BANK_CONTEXT.test(ctx) && !/routing/i.test(f.label)) return null;
  if (/routing|\baba\b|transit/i.test(f.label)) return "routing";
  if (/account (number|no\b|#)|acct/i.test(f.label)) return "account";
  if (/account type|checking or savings/i.test(f.label)) return "account_type";
  if (/bank name|name of (the )?bank|financial institution/i.test(f.label)) return "bank_name";
  if (/(name on|holder)/i.test(f.label)) return "holder";
  return null;
}

/** ••••6789: how review shows an account number. */
export const maskAccount = (n: string) => `••••${n.replace(/\s/g, "").slice(-4)}`;

/**
 * Bank fields filled in code from /auth/get, never through Gemini. value is the real number for the form;
 * display is what review shows (masked). Only called when the form has bank fields, and the caller puts these
 * behind an explicit permission prompt. Returns [] when no bank is connected or it has no checking/savings numbers.
 */
export async function plaidBankFill(
  userId: string,
  fields: FormField[],
): Promise<{ fieldId: string; value: string; display: string; source: string }[]> {
  const wanted = fields.map((f) => ({ f, kind: bankFieldKind(f) })).filter((x) => x.kind) as { f: FormField; kind: BankFieldKind }[];
  const item = getItem(userId);
  if (!wanted.length || !item) return [];
  const auth = await plaid<{ accounts: PlaidAccount[]; numbers: { ach?: { account_id: string; account: string; routing: string }[] } }>(
    "/auth/get",
    { access_token: item.access_token },
  );
  const ach = auth.numbers.ach ?? [];
  const rank = (a: PlaidAccount) => (a.subtype === "checking" ? 0 : a.subtype === "savings" ? 1 : 2);
  const acct = auth.accounts.filter((a) => a.type === "depository" && ach.some((n) => n.account_id === a.account_id)).sort((a, b) => rank(a) - rank(b))[0];
  const nums = acct && ach.find((n) => n.account_id === acct.account_id);
  if (!acct || !nums) return [];
  const institution = item.institution || "your bank";
  const source = `Bank: ${institution}, ${acct.name}${acct.mask ? ` ending ${acct.mask}` : ""} (via Plaid)`;
  // The owner the user confirmed is them (their identity source), never just the first name on a joint account.
  const ownerSource = db
    .prepare("SELECT text FROM sources WHERE user_id = ? AND connector = 'plaid' AND name LIKE '%(account owner)'")
    .get(userId) as { text: string } | undefined;
  const holder = ownerSource ? nameIn(ownerSource.text, "## Bank account owner") : null;
  const out: { fieldId: string; value: string; display: string; source: string }[] = [];
  for (const { f, kind } of wanted) {
    const value =
      kind === "routing"
        ? nums.routing
        : kind === "account"
          ? nums.account
          : kind === "account_type"
            ? matchOption(f, acct.subtype === "savings" ? "Savings" : "Checking")
            : kind === "bank_name"
              ? institution
              : holder;
    if (!value) continue;
    out.push({ fieldId: f.id, value, display: kind === "account" ? maskAccount(value) : value, source });
  }
  return out;
}

/** A select's own spelling of the value ("checking" for "Checking"), else the value. */
function matchOption(f: FormField, value: string): string {
  return f.options?.find((o) => o.toLowerCase().includes(value.toLowerCase())) ?? value;
}
