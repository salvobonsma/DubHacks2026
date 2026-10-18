"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectPanel, Spinner } from "@/components/ConnectPanel";
import { CheckIcon, LockIcon, WarningIcon } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import { PermissionPrompt, type PromptRequest } from "@/components/PermissionPrompt";
import { askKey, groupTitle, MODES, needsPrompt, type SharingMode } from "@/lib/permissions";
import type { FilledField, FormSchema, Twin } from "@/lib/types";
import { countWords } from "@/lib/words";

interface Session {
  id: string;
  business: string;
  returnUrl: string | null;
  schema: FormSchema;
}

interface Row {
  fieldId: string;
  label: string;
  category: string;
  maxWords?: number;
  value: string;
  source: string | null;
  include: boolean;
  reveal: boolean;
  denied: boolean;
}

type Step = "connect" | "filling" | "permissions" | "review" | "sent";

export function FillFlow() {
  const sessionId = useSearchParams().get("session");
  const [session, setSession] = useState<Session | null>(null);
  const [twin, setTwin] = useState<Twin | null>(null);
  const [twinLoaded, setTwinLoaded] = useState(false);
  const [step, setStep] = useState<Step>("connect");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SharingMode>("auto");
  const [queue, setQueue] = useState<PromptRequest[]>([]);
  const [promptIdx, setPromptIdx] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions?id=${sessionId}`)
      .then((r) => r.json())
      .then((s: Session) => {
        setSession(s);
        fetch(`/api/grants?business=${encodeURIComponent(s.business)}`)
          .then((r) => r.json())
          .then((g) => setMode(g.mode === "all" ? "all" : "auto"));
      });
    fetch("/api/twin")
      .then((r) => r.json())
      .then((d) => {
        setTwin(d.twin);
        setTwinLoaded(true);
      });
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
    const newRows: Row[] = session.schema.fields.map((f) => {
      const hit = byId.get(f.id);
      return {
        fieldId: f.id,
        label: f.label,
        category: f.category,
        maxWords: f.maxWords,
        value: hit?.value ?? "",
        source: hit?.source ?? null,
        include: !!hit?.value,
        reveal: f.category !== "sensitive",
        denied: false,
      };
    });
    setRows(newRows);

    // Build the permission queue: one prompt per broad group of info, skipping "always allow" grants.
    const { always } = await fetch(`/api/grants?business=${encodeURIComponent(session.business)}`).then((r) =>
      r.json(),
    );
    const groups = new Map<string, PromptRequest>();
    for (const f of session.schema.fields) {
      const row = newRows.find((r) => r.fieldId === f.id)!;
      if (!row.value || !needsPrompt(f, mode) || always.includes(askKey(f))) continue;
      const key = askKey(f);
      const g = groups.get(key) ?? {
        key,
        title: groupTitle(key),
        fields: [],
        sources: [],
      };
      g.fields.push({ label: f.label, value: row.value, sensitive: f.category === "sensitive" });
      if (row.source && !g.sources.includes(row.source)) g.sources.push(row.source);
      groups.set(key, g);
    }
    const q = [...groups.values()];
    setQueue(q);
    setPromptIdx(0);
    setStep(q.length ? "permissions" : "review");
  }

  async function decide(d: "once" | "always" | "deny") {
    if (!session) return;
    const req = queue[promptIdx];
    if (d === "always") {
      fetch("/api/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business: session.business, key: req.key, decision: "allow" }),
      });
    }
    if (d === "deny") {
      const ids = new Set(session.schema.fields.filter((f) => askKey(f) === req.key).map((f) => f.id));
      setRows((rs) =>
        rs.map((r) => (ids.has(r.fieldId) ? { ...r, value: "", source: null, include: false, denied: true } : r)),
      );
    }
    if (promptIdx + 1 < queue.length) setPromptIdx(promptIdx + 1);
    else setStep("review");
  }

  function changeMode(m: SharingMode) {
    setMode(m);
    if (session)
      fetch("/api/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business: session.business, mode: m }),
      });
  }

  /** Hand the result back: postMessage to the opener popup-style, or redirect back in a same-tab flow. */
  async function finish(status: "completed" | "cancelled", values?: Record<string, string>) {
    if (!session) return;
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, status, values }),
    });
    const target = session.returnUrl ? new URL(session.returnUrl).origin : "*";
    const type = status === "completed" ? "formly:filled" : "formly:cancelled";
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type, sessionId: session.id, values }, target);
      setTimeout(() => window.close(), status === "completed" ? 900 : 0);
    } else if (session.returnUrl) {
      const back = new URL(session.returnUrl);
      back.searchParams.set("formly_session", session.id);
      setTimeout(() => (window.location.href = back.toString()), status === "completed" ? 900 : 0);
    }
  }

  function approve() {
    const values = Object.fromEntries(rows.filter((r) => r.include && r.value).map((r) => [r.fieldId, r.value]));
    setStep("sent");
    finish("completed", values);
  }

  function cancel() {
    finish("cancelled");
  }

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.fieldId === id ? { ...r, ...patch } : r)));

  const filled = rows.filter((r) => r.include && r.value).length;
  const essayCount = session?.schema.fields.filter((f) => f.type === "textarea").length ?? 0;

  return (
    <div className="flex flex-1 flex-col bg-white">
      <header className="flex items-center justify-between bg-navy px-5 py-4">
        <Logo light />
        <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-white/10">
          <LockIcon className="h-3.5 w-3.5 text-[#22C985]" />
          Secure session
        </span>
      </header>

      <div className="flex-1 px-5 py-5">
        {!session ? (
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Loading…
          </div>
        ) : (
          <>
            <p className="flex items-end gap-2 text-base text-muted">
              {session.schema.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.schema.logo} alt={session.business} className="h-6 w-auto" />
              ) : (
                <strong className="text-navy">{session.business}</strong>
              )}
              <span className="leading-none">wants to fill out</span>
            </p>
            <h1 className="mt-0.5 text-[28px] leading-tight font-bold">{session.schema.title}</h1>
            <p className="mt-0.5 text-sm text-muted">
              Your source data never leaves Formly.
            </p>

            {step === "connect" && (
              <div className="mt-5 space-y-5">
                {twinLoaded && !twin && (
                  <div className="flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-dark">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                    <div>
                      <p className="font-semibold">You have no data sources yet</p>
                      <p className="mt-0.5 text-sm text-muted">
                        Add one below to begin.
                      </p>
                    </div>
                  </div>
                )}
                <ConnectPanel onTwin={setTwin} />
                {twin && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                      Sharing
                    </p>
                    <div className="space-y-1.5">
                      {MODES.map((m) => (
                        <label
                          key={m.id}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 ${
                            mode === m.id ? "border-navy bg-bg" : "border-line"
                          }`}
                        >
                          <input
                            type="radio"
                            name="mode"
                            checked={mode === m.id}
                            onChange={() => changeMode(m.id)}
                            className="mt-1 accent-navy"
                          />
                          <span>
                            <span className="block text-sm font-semibold">
                              {m.label}
                              {m.id === "all" && (
                                <WarningIcon className="ml-1.5 inline h-3 w-3 align-[-1px] text-amber-600" />
                              )}
                            </span>
                            <span className="block text-xs text-muted">{m.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
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
                <p className="text-xs text-muted">
                  Matching your digital twin to {session.business}&apos;s form
                  {essayCount > 0 &&
                    ` and drafting ${essayCount === 1 ? "a short answer" : `${essayCount} short answers`} from your resume`}
                </p>
              </div>
            )}

            {step === "permissions" && queue[promptIdx] && (
              <div className="mt-6">
                <PermissionPrompt
                  business={session.business}
                  request={queue[promptIdx]}
                  index={promptIdx}
                  total={queue.length}
                  onDecide={decide}
                />
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
                          className="accent-brand"
                        />
                        <span className="flex-1 text-xs font-medium text-muted">
                          {r.label}
                          {r.category === "sensitive" && <LockIcon className="ml-1 inline h-3 w-3 align-[-1px]" />}
                        </span>
                        {r.source && (
                          <span className="max-w-[40%] truncate rounded-full bg-brand/15 px-2 py-0.5 text-[10px] text-brand-dark">
                            {r.source}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex gap-2 pl-6">
                        {r.maxWords ? (
                          <div className="w-full">
                            <textarea
                              value={r.value}
                              rows={5}
                              placeholder={
                                r.denied
                                  ? "Denied. Write it yourself or leave it blank."
                                  : "Nothing in your data fits. Write it or leave it blank."
                              }
                              onChange={(e) => update(r.fieldId, { value: e.target.value, include: !!e.target.value })}
                              className="block w-full resize-y rounded-md border border-line px-2 py-1.5 text-sm leading-relaxed outline-none focus:border-brand"
                            />
                            <p
                              className={`mt-1 text-right text-[11px] ${
                                countWords(r.value) > r.maxWords ? "font-semibold text-red-600" : "text-muted"
                              }`}
                            >
                              {countWords(r.value)}/{r.maxWords} words
                            </p>
                          </div>
                        ) : (
                          <input
                            value={r.value}
                            type={r.reveal ? "text" : "password"}
                            placeholder={
                              r.denied
                                ? "Denied. Type it yourself or leave it blank."
                                : "Not found. Type it or leave it blank."
                            }
                            onChange={(e) => update(r.fieldId, { value: e.target.value, include: !!e.target.value })}
                            className="w-full rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-brand"
                          />
                        )}
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
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white">
                  <CheckIcon className="h-6 w-6" stroke={2.5} />
                </div>
                <p className="font-semibold">Sent to {session.business}</p>
              </div>
            )}
          </>
        )}
      </div>

      {session && (step === "connect" || step === "review") && (
        <footer className="sticky bottom-0 flex gap-2 border-t border-line bg-white px-5 py-4">
          <button
            onClick={cancel}
            className="rounded-xl px-4 py-3 text-sm font-semibold text-muted transition-colors hover:bg-bg"
          >
            Cancel
          </button>
          {step === "connect" ? (
            <button
              onClick={fill}
              disabled={!twin}
              className="flex-1 rounded-xl bg-navy py-3 font-semibold text-white transition-colors enabled:hover:bg-black disabled:opacity-40"
            >
              {twin || !twinLoaded ? "Fill my form" : "Add a source to continue"}
            </button>
          ) : (
            <button
              onClick={approve}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-navy transition-colors hover:bg-brand/90"
            >
              Approve &amp; send {filled} fields
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
