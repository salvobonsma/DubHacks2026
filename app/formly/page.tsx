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
    <div className="min-h-screen">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <Link href="/">
            <Logo light />
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[360px_1fr]">
        <div className="h-fit space-y-3">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-1 font-bold">Your data sources</h2>
            <p className="mb-4 text-sm text-muted">Formly reads these to keep your digital twin up to date.</p>
            <ConnectPanel onTwin={setTwin} />
          </section>
          <button
            onClick={async () => {
              if (!confirm("Remove all sources, the twin, and saved permissions?")) return;
              await Promise.all([
                fetch("/api/sources", { method: "DELETE" }),
                fetch("/api/grants", { method: "DELETE" }),
              ]);
              location.reload();
            }}
            className="w-full rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-muted shadow-sm transition hover:border-red-200 hover:text-red-600"
          >
            Reset demo
          </button>
        </div>
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">Your digital twin</h2>
            {twin && (
              <span className="text-xs text-muted">Updated {new Date(twin.updatedAt).toLocaleTimeString()}</span>
            )}
          </div>
          {twin && <p className="-mt-2 mb-1 text-xs text-muted">Click any fact to see where it came from.</p>}
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
                <div className="mt-6 border-t border-line pt-3 text-xs text-muted">
                  <span className="font-semibold">Removed:</span>{" "}
                  {removed.map((o, i) => (
                    <span key={o.label}>
                      {i > 0 && " · "}
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
            <p className="text-sm text-muted">Upload a file to build your twin.</p>
          )}
        </section>
      </main>
      {fact && <SourceViewer fact={fact} onClose={() => setFact(null)} />}
      {censoring && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCensoring(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">Censor {censoring.label} permanently?</h2>
            <p className="mt-2 text-sm text-muted">
              Formly will hide this value everywhere and never share it with a business, even if you approve a form that
              asks for it. This can&apos;t be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setCensoring(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-bg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  act(censoring, "censor");
                  setCensoring(null);
                }}
                className="rounded-full bg-navy px-5 py-2 text-sm font-medium text-white hover:bg-black"
              >
                Censor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
