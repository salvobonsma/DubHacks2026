"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectPanel, Spinner } from "@/components/ConnectPanel";
import { Logo } from "@/components/Logo";
import type { FilledField, FormSchema, Twin } from "@/lib/types";

interface Session {
  id: string;
  business: string;
  origin: string | null;
  schema: FormSchema;
}

interface Row {
  fieldId: string;
  label: string;
  category: string;
  value: string;
  source: string | null;
  include: boolean;
  reveal: boolean;
}

type Step = "connect" | "filling" | "review" | "sent";

export function FillFlow() {
  const sessionId = useSearchParams().get("session");
  const [session, setSession] = useState<Session | null>(null);
  const [twin, setTwin] = useState<Twin | null>(null);
  const [step, setStep] = useState<Step>("connect");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions?id=${sessionId}`)
      .then((r) => r.json())
      .then(setSession);
    fetch("/api/twin")
      .then((r) => r.json())
      .then((d) => setTwin(d.twin));
  }, [sessionId]);

  async function fill() {
    if (!session) return;
    setStep("filling");
    setError(null);
    const res = await fetch("/api/fill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: session.id }),
    }).then((r) => r.json());
    if (res.error) {
      setError(res.error);
      setStep("connect");
      return;
    }
    const byId = new Map<string, FilledField>((res.fields as FilledField[]).map((f) => [f.fieldId, f]));
    setRows(
      session.schema.fields.map((f) => {
        const hit = byId.get(f.id);
        return {
          fieldId: f.id,
          label: f.label,
          category: f.category,
          value: hit?.value ?? "",
          source: hit?.source ?? null,
          include: !!hit?.value,
          reveal: f.category !== "sensitive",
        };
      }),
    );
    setStep("review");
  }

  function approve() {
    if (!session) return;
    const values = Object.fromEntries(rows.filter((r) => r.include && r.value).map((r) => [r.fieldId, r.value]));
    window.opener?.postMessage({ type: "formly:filled", sessionId: session.id, values }, session.origin ?? "*");
    setStep("sent");
    setTimeout(() => window.close(), 900);
  }

  function cancel() {
    if (session) window.opener?.postMessage({ type: "formly:cancelled", sessionId: session.id }, session.origin ?? "*");
    window.close();
  }

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.fieldId === id ? { ...r, ...patch } : r)));

  const filled = rows.filter((r) => r.include && r.value).length;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex items-center justify-between bg-navy px-5 py-4">
        <Logo light />
        <span className="flex items-center gap-1.5 text-xs text-white/70">🔒 Secure session</span>
      </header>

      <div className="flex-1 px-5 py-5">
        {!session ? (
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Loading…
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">
              <strong className="text-navy">{session.business}</strong> wants to fill out
            </p>
            <h1 className="text-xl font-bold">{session.schema.title}</h1>
            <p className="mt-1 text-xs text-muted">
              {session.schema.fields.length} fields · {session.business} only receives the answers you approve, never
              your files.
            </p>

            {step === "connect" && (
              <div className="mt-5 space-y-5">
                <ConnectPanel onTwin={setTwin} />
                {twin && (
                  <div className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
                    Digital twin v{twin.version} · {twin.critical.length} facts known
                  </div>
                )}
                {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              </div>
            )}

            {step === "filling" && (
              <div className="mt-16 flex flex-col items-center gap-3 text-center">
                <span className="text-brand-dark">
                  <Spinner />
                </span>
                <p className="font-semibold">Filling {session.schema.fields.length} fields…</p>
                <p className="text-xs text-muted">Matching your digital twin to {session.business}&apos;s form</p>
              </div>
            )}

            {step === "review" && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold">
                  Review what you&apos;ll share ({filled}/{rows.length})
                </p>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {rows.map((r) => (
                    <li key={r.fieldId} className={`px-3 py-2 ${r.include ? "" : "opacity-50"}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => update(r.fieldId, { include: e.target.checked })}
                          className="accent-[#5bc48a]"
                        />
                        <span className="flex-1 text-xs font-medium text-muted">
                          {r.label}
                          {r.category === "sensitive" && " 🔒"}
                        </span>
                        {r.source && (
                          <span className="max-w-[40%] truncate rounded-full bg-brand/15 px-2 py-0.5 text-[10px] text-brand-dark">
                            {r.source}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex gap-2 pl-6">
                        <input
                          value={r.value}
                          type={r.reveal ? "text" : "password"}
                          placeholder="Not found — type it or leave blank"
                          onChange={(e) => update(r.fieldId, { value: e.target.value, include: !!e.target.value })}
                          className="w-full rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-brand"
                        />
                        {r.category === "sensitive" && (
                          <button
                            onClick={() => update(r.fieldId, { reveal: !r.reveal })}
                            className="text-xs text-muted"
                          >
                            {r.reveal ? "Hide" : "Show"}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === "sent" && (
              <div className="mt-16 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-xl text-white">
                  ✓
                </div>
                <p className="font-semibold">Sent to {session.business}</p>
              </div>
            )}
          </>
        )}
      </div>

      {session && (step === "connect" || step === "review") && (
        <footer className="sticky bottom-0 flex gap-2 border-t border-line bg-white px-5 py-4">
          <button onClick={cancel} className="rounded-xl px-4 py-3 text-sm font-semibold text-muted hover:bg-bg">
            Cancel
          </button>
          {step === "connect" ? (
            <button
              onClick={fill}
              disabled={!twin}
              className="flex-1 rounded-xl bg-navy py-3 font-semibold text-white disabled:opacity-40"
            >
              Fill my form
            </button>
          ) : (
            <button onClick={approve} className="flex-1 rounded-xl bg-brand py-3 font-semibold text-navy">
              Approve &amp; send {filled} fields
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
