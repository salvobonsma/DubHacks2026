import { db } from "./db";
import { buildTwinMarkdown, extractCriticalInfo } from "./llm";
import type { Source, Twin } from "./types";

export function listSources(): Source[] {
  return db.prepare("SELECT * FROM sources ORDER BY created_at").all() as Source[];
}

export function getTwin(): Twin | null {
  const row = db.prepare("SELECT * FROM twin WHERE id = 1").get() as
    | { markdown: string; critical_json: string; version: number; updated_at: number }
    | undefined;
  if (!row) return null;
  return {
    markdown: row.markdown,
    critical: JSON.parse(row.critical_json),
    version: row.version,
    updatedAt: row.updated_at,
  };
}

/** Stage 2: rebuild the digital twin + critical info from every connected source. */
export async function rebuildTwin(): Promise<Twin | null> {
  const sources = listSources();
  if (sources.length === 0) {
    db.prepare("DELETE FROM twin").run();
    return null;
  }
  const markdown = await buildTwinMarkdown(sources);
  const critical = await extractCriticalInfo(markdown);
  const version = (getTwin()?.version ?? 0) + 1;
  const now = Date.now();
  db.prepare(
    `INSERT INTO twin (id, markdown, critical_json, version, updated_at) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET markdown = excluded.markdown, critical_json = excluded.critical_json,
       version = excluded.version, updated_at = excluded.updated_at`,
  ).run(markdown, JSON.stringify(critical), version, now);
  return { markdown, critical, version, updatedAt: now };
}
