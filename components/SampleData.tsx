"use client";

import { useEffect, useState } from "react";
import { GoogleConsent, type GoogleScope } from "./GoogleConsent";
import { ProgressStatus } from "./ProgressStatus";

/**
 * Developer testing on /demo only: load a made-up persona as a "sample" source, so the demo forms can be
 * tried without a real account. Never offered in the Formly popup or on /formly.
 */
export function SampleData() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((s: { connector: string; name: string }[]) => setLoaded(s.find((x) => x.connector === "sample")?.name ?? null))
      .catch(() => {});
  }, []);

  async function load(scopes: GoogleScope[], account: string) {
    setOpen(false);
    setBusy("Loading sample data…");
    setError(null);
    const res = await fetch("/api/connectors/google/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes, account }),
    })
      .then((r) => r.json())
      .catch((e) => ({ error: (e as Error).message }));
    if (res.error) setError(res.error);
    const s = (await fetch("/api/sources").then((r) => r.json())) as { connector: string; name: string }[];
    setLoaded(s.find((x) => x.connector === "sample")?.name ?? null);
    setBusy(null);
  }

  async function remove() {
    setBusy("Removing sample data…");
    await fetch("/api/sources?connector=sample", { method: "DELETE" }).catch(() => {});
    setLoaded(null);
    setBusy(null);
  }

  return (
    <section className="mt-10 rounded-2xl border border-dashed border-line bg-white/60 p-5">
      <h2 className="text-base font-bold">Sample data for testing</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        For developers: load a made-up person instead of your own accounts. It&apos;s labelled as sample data
        everywhere and is deleted with the rest of your data.
      </p>
      {busy ? (
        <ProgressStatus label={busy} className="mt-4" />
      ) : loaded ? (
        <p className="mt-4 text-sm">
          Loaded: {loaded}.{" "}
          <button onClick={remove} className="font-medium text-muted underline hover:text-red-600">
            Remove
          </button>
        </p>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 rounded-full bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
        >
          Load sample data
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {open && <GoogleConsent onAllow={load} onCancel={() => setOpen(false)} />}
    </section>
  );
}
