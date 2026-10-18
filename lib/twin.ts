import { db } from "./db";
import { buildTwinMarkdown, extractCriticalInfo } from "./llm";
import type { CriticalFact, FactOverride, Source, Twin } from "./types";
import { wipedSince } from "./wipes";

// Every function here is per visitor: userId is the formly_uid cookie (lib/user.ts currentUser).

export function listSources(userId: string): Source[] {
  return db
    .prepare("SELECT id, connector, name, mime, text, created_at FROM sources WHERE user_id = ? ORDER BY created_at")
    .all(userId) as Source[];
}

export const CENSORED = "[censored]";

export function factKey(label: string) {
  return label.replace(/:$/, "").trim().toLowerCase();
}

export function listOverrides(userId: string): FactOverride[] {
  return db.prepare("SELECT label, action, value FROM fact_overrides WHERE user_id = ?").all(userId) as FactOverride[];
}

export function setOverride(userId: string, label: string, action: FactOverride["action"], value: string | null) {
  // created_at is kept on update: it's what the TTL purge measures from.
  db.prepare(
    `INSERT INTO fact_overrides (user_id, label, action, value, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, label) DO UPDATE SET action = excluded.action, value = excluded.value`,
  ).run(userId, factKey(label), action, value, Date.now());
}

export function clearOverride(userId: string, label: string) {
  db.prepare("DELETE FROM fact_overrides WHERE user_id = ? AND label = ?").run(userId, factKey(label));
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

export function getTwin(userId: string): Twin | null {
  const row = db.prepare("SELECT * FROM twin WHERE user_id = ?").get(userId) as
    | { markdown: string; critical_json: string; version: number; updated_at: number }
    | undefined;
  if (!row) return null;
  const overrides = listOverrides(userId);
  return {
    ...applyOverrides(row.markdown, JSON.parse(row.critical_json), overrides),
    overrides,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

/**
 * Stage 2: rebuild the digital twin + critical info from every connected source.
 * Pass { removed: true } after deleting or replacing sources: if the rebuild then fails, the old twin is
 * dropped rather than kept, since it still holds the data the user just took out and /api/fill reads it.
 * The UI then asks the user to build the twin again from the sources that are left.
 */
export async function rebuildTwin(userId: string, opts: { removed?: boolean } = {}): Promise<Twin | null> {
  const started = Date.now();
  const sources = listSources(userId);
  const drop = () => db.prepare("DELETE FROM twin WHERE user_id = ?").run(userId);
  if (sources.length === 0) {
    drop();
    return null;
  }
  let markdown: string, critical: CriticalFact[];
  try {
    [markdown, critical] = await Promise.all([buildTwinMarkdown(sources), extractCriticalInfo(sources)]);
  } catch (e) {
    if (opts.removed) drop();
    throw e;
  }
  // The rebuild took a while: if the user deleted everything meanwhile, don't bring the twin back.
  if (wipedSince(userId, started) || listSources(userId).length === 0) {
    drop();
    return null;
  }
  const version = (getTwin(userId)?.version ?? 0) + 1;
  const now = Date.now();
  db.prepare(
    `INSERT INTO twin (user_id, markdown, critical_json, version, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET markdown = excluded.markdown, critical_json = excluded.critical_json,
       version = excluded.version, updated_at = excluded.updated_at`,
  ).run(userId, markdown, JSON.stringify(critical), version, now, now);
  return getTwin(userId);
}
