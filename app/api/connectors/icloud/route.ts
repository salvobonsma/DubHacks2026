import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { listIcloudAccounts, readDriveDocs, SAMPLE_ROOT } from "@/lib/personas";
import { rebuildTwin } from "@/lib/twin";

const ALL_SCOPES = ["account", "contacts", "mail", "drive", "wallet", "health"] as const;
type Scope = (typeof ALL_SCOPES)[number];
const LABELS: Record<Scope, string> = {
  account: "Apple Account",
  contacts: "Contacts",
  mail: "iCloud Mail",
  drive: "iCloud Drive",
  wallet: "Wallet",
  health: "Health",
};

/** Demo accounts the mock Apple sign-in can switch between. */
export async function GET() {
  return Response.json({ accounts: await listIcloudAccounts() });
}

/**
 * Mock iCloud connector, the same process as the Google one: pretends Sign in with Apple succeeded and
 * "syncs" the chosen persona's iCloud data from sample-data/ as one source, limited to the scopes left
 * checked. iCloud Drive brings in the same documents as Google Drive.
 * Body: { account?: persona folder (default alex-chen), scopes?: Scope[] }.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { account?: string; scopes?: string[] };
  const scopes = ALL_SCOPES.filter((s) => (body.scopes ?? ALL_SCOPES).includes(s));
  if (scopes.length === 0) return Response.json({ error: "Pick at least one thing to share" }, { status: 400 });

  // Only accept known persona folders, never a path from the request.
  const account = (await listIcloudAccounts()).find((a) => a.id === (body.account ?? "alex-chen"));
  if (!account) return Response.json({ error: "Unknown account" }, { status: 400 });
  const dir = path.join(SAMPLE_ROOT, account.id);

  const icloud = JSON.parse(await fs.readFile(path.join(dir, "icloud_profile.json"), "utf8"));
  const parts: string[] = [`Apple Account: ${account.name} <${account.email}>`];
  const synced: Scope[] = [];
  const add = (scope: Scope, title: string, data: unknown) => {
    if (data == null || (Array.isArray(data) && data.length === 0)) return;
    parts.push(`## ${title}\n${JSON.stringify(data, null, 2)}`);
    synced.push(scope);
  };
  if (scopes.includes("account"))
    add("account", "Apple Account", { ...icloud.apple_account, address: icloud.address, devices: icloud.devices });
  if (scopes.includes("contacts")) add("contacts", "Contacts", icloud.contacts);
  if (scopes.includes("mail")) add("mail", "iCloud Mail receipts", icloud.icloud_mail);
  if (scopes.includes("wallet")) add("wallet", "Apple Wallet", icloud.wallet);
  if (scopes.includes("health")) add("health", "Health Medical ID", icloud.medical_id);
  if (scopes.includes("drive")) {
    const docs = await readDriveDocs(dir);
    for (const d of docs) parts.push(`## iCloud Drive: ${d.name}\n${d.text}`);
    if (docs.length) synced.push("drive");
  }
  if (synced.length === 0) return Response.json({ error: "Nothing to sync from that account" }, { status: 400 });

  db.prepare("DELETE FROM sources WHERE connector = 'icloud'").run();
  db.prepare("INSERT INTO sources (id, connector, name, mime, text, created_at) VALUES (?, 'icloud', ?, ?, ?, ?)").run(
    nanoid(),
    `iCloud (${synced.map((s) => LABELS[s]).join(", ")})`,
    "text/plain",
    parts.join("\n\n"),
    Date.now(),
  );

  try {
    return Response.json({ twin: await rebuildTwin() });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
