"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectPanel } from "@/components/ConnectPanel";
import { Logo } from "@/components/Logo";
import { Markdown, type TwinFact } from "@/components/Markdown";
import { SourceViewer } from "@/components/SourceViewer";
import type { FactAction, Twin } from "@/lib/types";

/** The user's Formly home: connected sources + their live digital twin. */
export default function FormlyHome() {
  const [twin, setTwin] = useState<Twin | null>(null);
  const [fact, setFact] = useState<TwinFact | null>(null);
  const [censoring, setCensoring] = useState<TwinFact | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  // In-page confirm: the in-app browser silently blocks window.confirm().
  async function resetDemo() {
    setResetBusy(true);
    await Promise.all([fetch("/api/sources", { method: "DELETE" }), fetch("/api/grants", { method: "DELETE" })]);
    location.reload();
  }
  const removed = twin?.overrides.filter((o) => o.action === "remove") ?? [];

  async function act(f: { label: string }, action: FactAction | "restore", value?: string) {
    const res =
      action === "restore"
        ? await fetch(`/api/twin?label=${encodeURIComponent(f.label.toLowerCase())}`, { method: "DELETE" })
        : await fetch("/api/twin", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: f.label, action, value }),
          });
    const data = await res.json();
    if (data.twin) setTwin(data.twin);
  }
  const secrets = twin?.critical.filter((f) => f.sensitivity === "sensitive").map((f) => f.value) ?? [];

  useEffect(() => {
    fetch("/api/twin")
      .then((r) => r.json())
      .then((d) => setTwin(d.twin));
  }, []);

  return (
    <div className="flex-1">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <Link href="/">
            <Logo light />
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[360px_1fr]">
        <div className="h-fit space-y-3">
          <section className="rounded-2xl border border-transparent bg-white p-5 shadow-surface">
            <h2 className="mb-1 font-bold">Your data sources</h2>
            <p className="mb-4 text-sm text-muted">Formly reads these to keep your digital twin up to date.</p>
            <ConnectPanel onTwin={setTwin} />
          </section>
          <button
            onClick={() => setResetting(true)}
            className="w-full rounded-2xl border border-transparent bg-white px-4 py-2.5 text-sm font-medium text-muted shadow-surface transition hover:text-red-600 hover:shadow-surface-hover"
          >
            Reset demo
          </button>
        </div>
        <section className="rounded-2xl border border-transparent bg-white p-5 shadow-surface">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">Your digital twin</h2>
            {twin && (
              <span className="text-xs text-muted">
                Updated{" "}
                {new Date(twin.updatedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          {twin ? (
            <>
              <Markdown
                text={twin.markdown}
                secrets={secrets}
                overrides={twin.overrides}
                onFact={setFact}
                onAction={(f, action, value) => (action === "censor" ? setCensoring(f) : act(f, action, value))}
              />
              {removed.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
                  <span className="font-semibold">Removed:</span>
                  {removed.map((o) => (
                    <span key={o.label}>
                      <span className="capitalize">{o.label}</span>{" "}
                      <button onClick={() => act(o, "restore")} className="font-medium text-brand-dark hover:underline">
                        Restore
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Add a source to build your digital twin.</p>
          )}
        </section>
      </main>
      {fact && <SourceViewer fact={fact} onClose={() => setFact(null)} />}
      {resetting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !resetBusy && setResetting(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">Reset the demo?</h2>
            <p className="mt-2 text-sm text-muted">This clears all the data.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setResetting(false)}
                disabled={resetBusy}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-bg"
              >
                Cancel
              </button>
              <button
                onClick={resetDemo}
                disabled={resetBusy}
                className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {resetBusy ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
      {censoring && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCensoring(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">Never share {censoring.label}?</h2>
            <p className="mt-2 text-sm text-muted">
              Formly will hide this value everywhere and never share it with a business, even if you approve a form that
              asks for it. This can&apos;t be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setCensoring(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-bg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  act(censoring, "censor");
                  setCensoring(null);
                }}
                className="rounded-full bg-navy px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
              >
                Never share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
