// Score Formly's T-Mobile fill against the synthetic inboxes' known answers, through the real app:
// a fresh visitor uploads the person's .eml files, the twin is built, a T-Mobile session is filled.
//
// Usage (dev server running): node scripts/synth/eval.mjs [slug...]   (BASE=http://localhost:3000)
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ROOT = "sample-data/synthetic";
const schema = JSON.parse(fs.readFileSync("lib/schemas/tmobile.json", "utf8"));

const digits = (s) => String(s ?? "").replace(/\D/g, "");
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
function sameDate(a, b) {
  const d = (s) => {
    const t = Date.parse(String(s ?? ""));
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    const m = String(s ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
  };
  return d(a) && d(a) === d(b);
}
function sameValue(id, got, want) {
  if (id === "dob") return sameDate(got, want);
  if (id === "phone") return digits(got).slice(-10) === digits(want).slice(-10);
  if (id === "street" || id === "apt") return norm(got).replace(/street$|st$/, "") === norm(want).replace(/street$|st$/, "");
  return norm(got) === norm(want);
}

async function visit() {
  // A fresh visitor: the proxy sets formly_uid on the first response.
  const res = await fetch(`${BASE}/api/me`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("no formly_uid cookie from /api/me");
  return cookie;
}

async function runOne(slug) {
  const dir = path.join(ROOT, slug);
  const { name, truth } = JSON.parse(fs.readFileSync(path.join(dir, "truth.json"), "utf8"));
  const cookie = await visit();
  const form = new FormData();
  for (const f of fs.readdirSync(path.join(dir, "inbox"))) {
    form.append("files", new Blob([fs.readFileSync(path.join(dir, "inbox", f))], { type: "message/rfc822" }), f);
  }
  const t0 = Date.now();
  const up = await fetch(`${BASE}/api/sources`, { method: "POST", body: form, headers: { cookie } });
  const upJson = await up.json();
  if (!up.ok) return { slug, name, error: `upload: ${upJson.error}` };
  const t1 = Date.now();
  const s = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ schema, returnUrl: `${BASE}/tmobile` }),
  }).then((r) => r.json());
  const fill = await fetch(`${BASE}/api/fill`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ sessionId: s.sessionId }),
  });
  const fillJson = await fill.json();
  const t2 = Date.now();
  if (!fill.ok) return { slug, name, error: `fill: ${fillJson.error}` };
  const got = Object.fromEntries((fillJson.fields ?? []).map((f) => [f.fieldId, f]));

  const traps = truth._traps?.relative ? [truth._traps.relative.name, truth._traps.relative.street, truth._traps.relative.city].map(norm) : [];
  const rows = [];
  for (const [id, t] of Object.entries(truth)) {
    if (id.startsWith("_")) continue;
    const g = got[id] ?? {};
    const v = g.value ?? null;
    let verdict;
    if (t.kind === "never") verdict = v == null ? "ok" : "LEAK";
    else if (t.kind === "blank-ok") verdict = v == null || v === "" ? "ok" : `extra:${v}`;
    else if (t.kind === "fact") verdict = v == null ? "MISSING" : sameValue(id, v, t.value) ? "ok" : "WRONG";
    else verdict = t.expect.includes(v) ? (v == null || g.reason || g.suggested || g.source ? "ok" : "no-reason") : v == null ? "MISSING" : "WRONG";
    if (v && traps.some((x) => x && norm(v).includes(x))) verdict = "TRAP";
    rows.push({ id, kind: t.kind, want: t.value ?? t.expect ?? null, got: v, verdict, source: g.source ?? null, reason: g.reason ?? null });
  }
  return { slug, name, uploadMs: t1 - t0, fillMs: t2 - t1, rows, uploadErrors: upJson.errors ?? [] };
}

const only = process.argv.slice(2);
const slugs = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "truth.json")) && (!only.length || only.includes(d)));
const results = [];
for (const slug of slugs) {
  const r = await runOne(slug).catch((e) => ({ slug, error: e.message }));
  results.push(r);
  if (r.error) console.log(`${slug}: ERROR ${r.error}`);
  else {
    const bad = r.rows.filter((x) => x.verdict !== "ok");
    console.log(`${slug}: ${r.rows.length - bad.length}/${r.rows.length} ok (upload ${(r.uploadMs / 1000).toFixed(1)}s, fill ${(r.fillMs / 1000).toFixed(1)}s)`);
    for (const b of bad) console.log(`   ${b.verdict.padEnd(8)} ${b.id}: got ${JSON.stringify(b.got)} want ${JSON.stringify(b.want)}`);
  }
}
fs.mkdirSync(path.join(ROOT, "results"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "results", "latest.json"), JSON.stringify(results, null, 2));
const all = results.flatMap((r) => r.rows ?? []);
const by = (k) => all.filter((x) => x.kind === k);
const pct = (xs) => (xs.length ? `${Math.round((100 * xs.filter((x) => x.verdict === "ok").length) / xs.length)}%` : "-");
console.log(`\nFacts ${pct(by("fact"))} · Suggestions ${pct(by("suggest"))} · Never-fill ${pct(by("never"))} · Trap hits ${all.filter((x) => x.verdict === "TRAP").length}`);
