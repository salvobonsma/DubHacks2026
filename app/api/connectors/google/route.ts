import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { extractText } from "@/lib/extract";
import { rebuildTwin } from "@/lib/twin";

const SAMPLE_DIR = path.join(process.cwd(), "sample-data", "alex-chen");
const ALL_SCOPES = ["profile", "contacts", "gmail", "drive"] as const;
type Scope = (typeof ALL_SCOPES)[number];
const LABELS: Record<Scope, string> = { profile: "Profile", contacts: "Contacts", gmail: "Gmail", drive: "Drive" };

/**
 * Mock Google connector: pretends OAuth succeeded and "syncs" the demo persona's Google data from
 * sample-data/ as one source, limited to the scopes the user left checked ({ scopes } in the body).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { scopes?: string[] };
  const scopes = ALL_SCOPES.filter((s) => (body.scopes ?? ALL_SCOPES).includes(s));
  if (scopes.length === 0) return Response.json({ error: "Pick at least one thing to share" }, { status: 400 });

  const google = JSON.parse(await fs.readFile(path.join(SAMPLE_DIR, "google_profile.json"), "utf8"));
  const parts: string[] = [];
  if (scopes.includes("profile"))
    parts.push(`## Profile\n${JSON.stringify({ ...google.profile, addresses: google.addresses }, null, 2)}`);
  if (scopes.includes("contacts")) parts.push(`## Contacts\n${JSON.stringify(google.contacts, null, 2)}`);
  if (scopes.includes("gmail")) parts.push(`## Gmail receipts\n${JSON.stringify(google.gmail_receipts, null, 2)}`);
  if (scopes.includes("drive")) {
    const resume = await fs.readFile(path.join(SAMPLE_DIR, "resume.docx"));
    parts.push(`## Drive: Resume.docx\n${await extractText("resume.docx", "", resume)}`);
  }

  db.prepare("DELETE FROM sources WHERE connector = 'google'").run();
  db.prepare("INSERT INTO sources (id, connector, name, mime, text, created_at) VALUES (?, 'google', ?, ?, ?, ?)").run(
    nanoid(),
    `Google (${scopes.map((s) => LABELS[s]).join(", ")})`,
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
