import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { extractText } from "@/lib/extract";
import { listGoogleAccounts, SAMPLE_ROOT } from "@/lib/personas";
import { rebuildTwin } from "@/lib/twin";

const ALL_SCOPES = ["profile", "contacts", "gmail", "drive"] as const;
type Scope = (typeof ALL_SCOPES)[number];
const LABELS: Record<Scope, string> = { profile: "Profile", contacts: "Contacts", gmail: "Gmail", drive: "Drive" };

/** Demo accounts the mock Google sign-in can switch between. */
export async function GET() {
  return Response.json({ accounts: await listGoogleAccounts() });
}

/**
 * Mock Google connector: pretends OAuth succeeded and "syncs" the chosen demo persona's Google data
 * from sample-data/ as one source, limited to the scopes the user left checked.
 * Body: { account?: persona folder (default alex-chen), scopes?: Scope[] }.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { account?: string; scopes?: string[] };
  const scopes = ALL_SCOPES.filter((s) => (body.scopes ?? ALL_SCOPES).includes(s));
  if (scopes.length === 0) return Response.json({ error: "Pick at least one thing to share" }, { status: 400 });

  // Only accept known persona folders, never a path from the request.
  const account = (await listGoogleAccounts()).find((a) => a.id === (body.account ?? "alex-chen"));
  if (!account) return Response.json({ error: "Unknown account" }, { status: 400 });
  const dir = path.join(SAMPLE_ROOT, account.id);

  const google = JSON.parse(await fs.readFile(path.join(dir, "google_profile.json"), "utf8"));
  const parts: string[] = [`Google account: ${account.name} <${account.email}>`];
  const synced: Scope[] = [];
  if (scopes.includes("profile")) {
    parts.push(`## Profile\n${JSON.stringify({ ...google.profile, addresses: google.addresses }, null, 2)}`);
    synced.push("profile");
  }
  if (scopes.includes("contacts") && google.contacts?.length) {
    parts.push(`## Contacts\n${JSON.stringify(google.contacts, null, 2)}`);
    synced.push("contacts");
  }
  if (scopes.includes("gmail") && google.gmail_receipts?.length) {
    parts.push(`## Gmail receipts\n${JSON.stringify(google.gmail_receipts, null, 2)}`);
    synced.push("gmail");
  }
  if (scopes.includes("drive")) {
    // The persona's own notes stand in for a "Personal info" doc in their Drive, so Google alone brings
    // in everything forms ask for (IDs, vehicles, health, money), not just the resume.
    const notes = await fs.readFile(path.join(dir, "personal_info.txt"), "utf8").catch(() => null);
    if (notes) parts.push(`## Drive: Personal info.txt\n${notes}`);
    const resume = await fs.readFile(path.join(dir, "resume.docx")).catch(() => null);
    if (resume) parts.push(`## Drive: Resume.docx\n${await extractText("resume.docx", "", resume)}`);
    if (notes || resume) synced.push("drive");
  }
  if (synced.length === 0) return Response.json({ error: "Nothing to sync from that account" }, { status: 400 });

  db.prepare("DELETE FROM sources WHERE connector = 'google'").run();
  db.prepare("INSERT INTO sources (id, connector, name, mime, text, created_at) VALUES (?, 'google', ?, ?, ?, ?)").run(
    nanoid(),
    `Google (${synced.map((s) => LABELS[s]).join(", ")})`,
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
