import { db } from "./db";
import { buildTwinMarkdown, extractCriticalInfo } from "./llm";
import type { CriticalFact, FactOverride, Source, Twin } from "./types";

export function listSources(): Source[] {
  return db.prepare("SELECT * FROM sources ORDER BY created_at").all() as Source[];
}

export const CENSORED = "[censored]";

export function factKey(label: string) {
  return label.replace(/:$/, "").trim().toLowerCase();
}

export function listOverrides(): FactOverride[] {
  return db.prepare("SELECT label, action, value FROM fact_overrides").all() as FactOverride[];
}

export function setOverride(label: string, action: FactOverride["action"], value: string | null) {
  db.prepare(
    `INSERT INTO fact_overrides (label, action, value, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(label) DO UPDATE SET action = excluded.action, value = excluded.value, created_at = excluded.created_at`,
  ).run(factKey(label), action, value, Date.now());
}

export function clearOverride(label: string) {
  db.prepare("DELETE FROM fact_overrides WHERE label = ?").run(factKey(label));
}

const BULLET = /^(\s*[-*]\s+\*\*)([^*]+?)(:?\*\*:?\s*)(.*?)(\s*_\(source:.*\)_\s*)?$/;

/**
 * Apply the user's remove/edit/censor choices to the generated twin. Critical facts whose value
 * appeared in a changed bullet are dropped so form filling can't fall back to the old value.
 */
function applyOverrides(markdown: string, critical: CriticalFact[], overrides: FactOverride[]) {
  if (!overrides.length) return { markdown, critical };
  const byKey = new Map(overrides.map((o) => [o.label, o]));
  const stale: string[] = [];
  const lines: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = line.match(BULLET);
    const o = m && byKey.get(factKey(m[2]));
    if (!m || !o) {
      lines.push(line);
      continue;
    }
    stale.push(m[4]);
    if (o.action === "remove") continue;
    const value = o.action === "censor" ? CENSORED : (o.value ?? "");
    lines.push(m[1] + m[2] + m[3] + value + (m[5] ?? ""));
  }
  return {
    markdown: lines.join("\n"),
    critical: critical.filter((f) => !stale.some((v) => f.value && v.includes(f.value))),
  };
}

export function getTwin(): Twin | null {
  const row = db.prepare("SELECT * FROM twin WHERE id = 1").get() as
    | { markdown: string; critical_json: string; version: number; updated_at: number }
    | undefined;
  if (!row) return null;
  const overrides = listOverrides();
  return {
    ...applyOverrides(row.markdown, JSON.parse(row.critical_json), overrides),
    overrides,
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
  const [markdown, critical] = await Promise.all([buildTwinMarkdown(sources), extractCriticalInfo(sources)]);
  const version = (getTwin()?.version ?? 0) + 1;
  const now = Date.now();
  db.prepare(
    `INSERT INTO twin (id, markdown, critical_json, version, updated_at) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET markdown = excluded.markdown, critical_json = excluded.critical_json,
       version = excluded.version, updated_at = excluded.updated_at`,
  ).run(markdown, JSON.stringify(critical), version, now);
  return getTwin();
}
