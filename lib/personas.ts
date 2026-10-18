import fs from "node:fs/promises";
import path from "node:path";
import { extractText } from "./extract";

export const SAMPLE_ROOT = path.join(process.cwd(), "sample-data");

export interface DemoAccount {
  /** Folder name under sample-data/, e.g. "alex-chen". */
  id: string;
  name: string;
  email: string;
}

/** Every persona with the given profile file, Alex Chen first. Mock connectors offer these as accounts. */
async function listAccounts(
  file: string,
  identity: (profile: Record<string, { name?: string; email?: string } | undefined>) => { name?: string; email?: string },
): Promise<DemoAccount[]> {
  const dirs = await fs.readdir(SAMPLE_ROOT, { withFileTypes: true });
  const accounts: DemoAccount[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    try {
      const { name, email } = identity(JSON.parse(await fs.readFile(path.join(SAMPLE_ROOT, d.name, file), "utf8")));
      accounts.push({ id: d.name, name: name ?? d.name, email: email ?? "" });
    } catch {
      // No profile of this kind for this persona.
    }
  }
  return accounts.sort((a, b) => (a.id === "alex-chen" ? -1 : b.id === "alex-chen" ? 1 : a.name.localeCompare(b.name)));
}

export const listGoogleAccounts = () => listAccounts("google_profile.json", (g) => g.profile ?? {});
export const listIcloudAccounts = () => listAccounts("icloud_profile.json", (a) => a.apple_account ?? {});

/**
 * The documents a persona keeps in cloud storage (Google Drive or iCloud Drive): their own notes, standing
 * in for a "Personal info" doc, and their resume. Same files for both, so either connector gives Formly
 * everything forms ask for.
 */
export async function readDriveDocs(dir: string): Promise<{ name: string; text: string }[]> {
  const docs: { name: string; text: string }[] = [];
  const notes = await fs.readFile(path.join(dir, "personal_info.txt"), "utf8").catch(() => null);
  if (notes) docs.push({ name: "Personal info.txt", text: notes });
  const resume = await fs.readFile(path.join(dir, "resume.docx")).catch(() => null);
  if (resume) docs.push({ name: "Resume.docx", text: await extractText("resume.docx", "", resume) });
  return docs;
}
