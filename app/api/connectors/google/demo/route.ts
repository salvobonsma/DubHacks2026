import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { extractText } from "@/lib/extract";
import { listGoogleAccounts, SAMPLE_ROOT } from "@/lib/personas";
import { rebuildTwin } from "@/lib/twin";
import { currentUser } from "@/lib/user";

const ALL_SCOPES = ["profile", "contacts", "gmail", "drive"] as const;
type Scope = (typeof ALL_SCOPES)[number];
const LABELS: Record<Scope, string> = { profile: "Profile", contacts: "Contacts", gmail: "Gmail", drive: "Drive" };

/**
 * Developer testing only, reached from /demo: loads a sample persona's made-up "Google" data as one source
 * (connector "sample", so it's never mistaken for a real account). No real Google account is involved.
 */
export async function GET() {
  await connection();
  return Response.json({ accounts: await listGoogleAccounts() });
}

/** Body: { account?: persona folder (default alex-chen), scopes?: Scope[] }. Replaces any earlier sample data. */
export async function POST(req: Request) {
  const user = currentUser(req);
  const body = (await req.json().catch(() => ({}))) as { account?: string; scopes?: string[] };
  const scopes = ALL_SCOPES.filter((s) => (body.scopes ?? ALL_SCOPES).includes(s));
  if (scopes.length === 0) return Response.json({ error: "Pick at least one thing to share" }, { status: 400 });

  // Only accept known persona folders, never a path from the request.
  const account = (await listGoogleAccounts()).find((a) => a.id === (body.account ?? "alex-chen"));
  if (!account) return Response.json({ error: "Unknown account" }, { status: 400 });
  const dir = path.join(SAMPLE_ROOT, account.id);

  const google = JSON.parse(await fs.readFile(path.join(dir, "google_profile.json"), "utf8"));
  const parts: string[] = [`Sample data (not a real account): ${account.name} <${account.email}>`];
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
    const resume = await fs.readFile(path.join(dir, "resume.docx")).catch(() => null);
    if (resume) parts.push(`## Drive: Resume.docx\n${await extractText("resume.docx", "", resume)}`);
    // The persona's own notes doc (ID, SSN, card, plan, income): without it a sample account can't fill a
    // signup like T-Mobile's.
    const info = await fs.readFile(path.join(dir, "personal_info.txt"), "utf8").catch(() => null);
    if (info) parts.push(`## Drive: ${account.name} - personal info.txt\n${info}`);
    if (resume || info) synced.push("drive");
  }
  if (synced.length === 0) return Response.json({ error: "Nothing to load from that account" }, { status: 400 });

  db.transaction(() => {
    db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = 'sample'").run(user);
    db.prepare("INSERT INTO sources (id, user_id, connector, name, mime, text, created_at) VALUES (?, ?, 'sample', ?, ?, ?, ?)").run(
      nanoid(),
      user,
      `Sample data: ${account.name} (${synced.map((s) => LABELS[s]).join(", ")})`,
      "text/plain",
      parts.join("\n\n"),
      Date.now(),
    );
  })();

  try {
    return Response.json({ twin: await rebuildTwin(user, { removed: true }) });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
