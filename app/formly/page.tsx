"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectPanel } from "@/components/ConnectPanel";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import type { Twin } from "@/lib/types";

/** The user's Formly home: connected sources + their live digital twin. */
export default function FormlyHome() {
  const [twin, setTwin] = useState<Twin | null>(null);

  useEffect(() => {
    fetch("/api/twin")
      .then((r) => r.json())
      .then((d) => setTwin(d.twin));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <Logo light />
          <Link href="/tmobile" className="ml-auto text-sm text-white/70 hover:text-white">
            Demo store →
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[360px_1fr]">
        <section className="h-fit rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-bold">Your data sources</h2>
          <p className="mb-4 text-sm text-muted">Formly reads these to keep your digital twin up to date.</p>
          <ConnectPanel onTwin={setTwin} />
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">Your digital twin</h2>
            {twin && (
              <span className="text-xs text-muted">
                v{twin.version} · updated {new Date(twin.updatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          {twin ? (
            <>
              <Markdown text={twin.markdown} />
              <details className="mt-6">
                <summary className="cursor-pointer text-sm font-semibold">
                  Critical info ({twin.critical.length} facts)
                </summary>
                <table className="mt-2 w-full text-left text-xs">
                  <tbody>
                    {twin.critical.map((f) => (
                      <tr key={f.key} className="border-t border-line">
                        <td className="py-1 pr-2 font-mono text-muted">{f.key}</td>
                        <td className="py-1 pr-2">{f.sensitivity === "sensitive" ? "••••••" : f.value}</td>
                        <td className="py-1 text-muted">{f.sensitivity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted">Upload a file to build your twin.</p>
          )}
        </section>
      </main>
    </div>
  );
}
