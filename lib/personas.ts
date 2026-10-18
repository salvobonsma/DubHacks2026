import fs from "node:fs/promises";
import path from "node:path";

export const SAMPLE_ROOT = path.join(process.cwd(), "sample-data");

export interface DemoAccount {
  /** Folder name under sample-data/, e.g. "alex-chen". */
  id: string;
  name: string;
  email: string;
}

/** Every demo persona with a Google profile, Alex Chen first. Mock connectors offer these as accounts. */
export async function listGoogleAccounts(): Promise<DemoAccount[]> {
  const dirs = await fs.readdir(SAMPLE_ROOT, { withFileTypes: true });
  const accounts: DemoAccount[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    try {
      const g = JSON.parse(await fs.readFile(path.join(SAMPLE_ROOT, d.name, "google_profile.json"), "utf8"));
      accounts.push({ id: d.name, name: g.profile?.name ?? d.name, email: g.profile?.email ?? "" });
    } catch {
      // No Google profile for this persona.
    }
  }
  return accounts.sort((a, b) => (a.id === "alex-chen" ? -1 : b.id === "alex-chen" ? 1 : a.name.localeCompare(b.name)));
}
