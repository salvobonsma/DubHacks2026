import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { extractText } from "@/lib/extract";
import { rebuildTwin } from "@/lib/twin";

const SAMPLE_DIR = path.join(process.cwd(), "sample-data", "alex-chen");

/**
 * Mock Google connector: pretends OAuth succeeded and "syncs" the demo persona's
 * Google profile, contacts, Gmail receipts and a Drive doc from sample-data/.
 */
export async function POST() {
  const profile = await fs.readFile(path.join(SAMPLE_DIR, "google_profile.json"));
  const resume = await fs.readFile(path.join(SAMPLE_DIR, "resume.docx"));

  db.prepare("DELETE FROM sources WHERE connector = 'google'").run();
  const insert = db.prepare(
    "INSERT INTO sources (id, connector, name, mime, text, created_at) VALUES (?, 'google', ?, ?, ?, ?)",
  );
  insert.run(nanoid(), "Google Account (profile, contacts, Gmail)", "application/json",
    await extractText("google_profile.json", "application/json", profile), Date.now());
  insert.run(nanoid(), "Google Drive: Resume.docx", null, await extractText("resume.docx", "", resume), Date.now());

  try {
    return Response.json({ twin: await rebuildTwin() });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
