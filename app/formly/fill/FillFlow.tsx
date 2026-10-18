"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { ConnectPanel, Spinner } from "@/components/ConnectPanel";
import { ProgressStatus } from "@/components/ProgressStatus";
import { CheckIcon, LockIcon, WarningIcon } from "@/components/Icons";
import { Logo, Mark } from "@/components/Logo";
import { PermissionPrompt, type PromptRequest } from "@/components/PermissionPrompt";
import { askKey, groupTitle, MODES, needsPrompt, type SharingMode } from "@/lib/permissions";
import type { FilledField, FormSchema, MerchantTheme, Twin } from "@/lib/types";
import { countWords } from "@/lib/words";

interface Session {
  id: string;
  business: string;
  returnUrl: string | null;
  schema: FormSchema;
}

interface SourceRow {
  connector: string;
  name: string;
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
  /** Formly found a value for it; decides the Filled / Not filled tab without moving rows as you type. */
  found: boolean;
  /** Formly's suggestion (a choice or an inference) rather than a fact copied from the data. */
  suggested: boolean;
  /** Why, for a suggestion: one line drawn from the user's data. */
  reason: string | null;
}

type Step = "connect" | "filling" | "permissions" | "review" | "sent";

const CONNECTOR_NAMES: Record<string, string> = {
  google: "Google",
  microsoft: "Microsoft",
  plaid: "your bank",
  "password-manager": "your password manager",
  passwords: "your saved logins",
  scan: "your phone",
  sample: "sample data",
};
/** Set when this window was opened as the Formly popup, so a lost opener (after Google's sign-in) is noticed. */
const POPUP_KEY = "formly:popup";

/** "Google, your phone and resume.docx": one line naming where the twin's data came from. */
function sourceSummary(sources: SourceRow[]) {
  const parts = [
    ...new Set(sources.filter((s) => s.connector !== "upload").map((s) => CONNECTOR_NAMES[s.connector] ?? s.connector)),
  ];
  const files = sources.filter((s) => s.connector === "upload");
  if (files.length === 1) parts.push(files[0].name);
  else if (files.length > 1) parts.push(`${files.length} files`);
  return parts.length < 2 ? (parts[0] ?? "your digital twin") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** The one definition of "will be sent", used by the header count, the tabs and the Send button. */
const willSend = (r: Row) => r.include && !!r.value && !r.denied;

/**
 * The merchant's theme as CSS variables on the popup's root. The Formly components inside use Tailwind colors
 * that read --navy, --green, --border, --muted and --bg, and radii that read --radius-*, so they take the
 * merchant's look without a second set of styles. --fy-* are the popup's own primary button.
 */
function themeStyle(t: MerchantTheme): CSSProperties {
  return {
    "--navy": t.colors.text,
    "--green": t.colors.primary,
    "--green-dark": t.colors.primary,
    "--border": t.colors.border,
    "--muted": t.colors.muted,
    "--bg": t.colors.surface,
    "--font-dm-sans": t.font,
    "--font-sora": t.font,
    "--radius-md": `${t.radius.input}px`,
    "--radius-lg": `${t.radius.button}px`,
    "--radius-xl": `${t.radius.button}px`,
    "--radius-2xl": `${t.radius.card}px`,
    "--fy-primary": t.colors.primary,
    "--fy-primary-hover": t.colors.primaryHover,
    "--fy-primary-text": t.colors.primaryText,
    fontFamily: t.font,
    color: t.colors.text,
  } as CSSProperties;
}

function fontFaces(t: MerchantTheme) {
  return (t.fontFaces ?? [])
    .map((f) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-display:swap;src:url("${f.src}") format("woff2")}`)
    .join("");
}

/** "Fill your T-Mobile signup" when the form's title already names the business, else "Fill your Chase form". */
function heading(schema: FormSchema) {
  return schema.title.toLowerCase().startsWith(schema.business.toLowerCase())
    ? { title: `Fill your ${schema.title}`, subtitle: null }
    : { title: `Fill your ${schema.business} form`, subtitle: schema.title };
}

/** A date reads the way the form prints it, 07/22/1994, not the ISO value that gets sent. */
function shownDate(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : v;
}

/** Show only the last four characters of a sensitive value until the user reveals it. */
function maskValue(v: string) {
  return v.length <= 4 ? "••••" : `${"•".repeat(Math.min(v.length - 4, 8))}${v.slice(-4)}`;
}

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
  const [reviewTab, setReviewTab] = useState<"send" | "skip">("send");
  /** Rows toggled in the open tab stay put until the tab changes, so a row never jumps away mid-click. */
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<SourceRow[]>([]);
  /** With a twin already built, the popup shows a one-line source summary until "Change sources". */
  const [panelOpen, setPanelOpen] = useState(false);
  /** A source was just added (or Google came back from sign-in): run the fill as soon as the session is loaded. */
  const [autoFill, setAutoFill] = useState(false);
  /** The approved answers went out but this window can't hand them back itself (no opener, can't close). */
  const [orphaned, setOrphaned] = useState(false);

  // A merchant-themed popup's tab is titled as the merchant's step ("Fill your signup · T-Mobile"), not "Formly".
  useEffect(() => {
    if (session?.schema.theme) document.title = `${session.schema.theme.headerTitle} · ${session.business}`;
  }, [session]);

  useEffect(() => {
    if (!sessionId) return;
    // Take the session if a merchant on another origin made it without a cookie (no-op when it's ours), then read it.
    fetch("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, claim: true }),
    })
      .catch(() => undefined)
      .then(() => fetch(`/api/sessions?id=${sessionId}`))
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
        // Coming back from a connector's OAuth page: open the panel so it can show the result.
        const q = new URLSearchParams(window.location.search);
        if (!d.twin || q.has("connected") || q.has("connect_error")) setPanelOpen(true);
      })
      // If the profile can't load, still show the ways to add data rather than an empty screen.
      .catch(() => {
        setTwinLoaded(true);
        setPanelOpen(true);
      });
    fetch("/api/sources")
      .then((r) => r.json())
      .then((s: SourceRow[]) => setSources(Array.isArray(s) ? s : []));
    try {
      if (window.opener) sessionStorage.setItem(POPUP_KEY, sessionId);
    } catch {}
  }, [sessionId]);

  // Straight from "source added" to the fill: no extra tap on Fill my form.
  useEffect(() => {
    if (!autoFill || !session || !twin || step !== "connect") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoFill(false);
    fill();
    // fill reads the current session and mode; it only needs to run when these change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFill, session, twin, step]);

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
        found: !!hit?.value,
        suggested: !!hit?.value && !!hit.suggested,
        reason: hit?.value && hit.suggested ? (hit.reason ?? null) : null,
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
        title: "",
        fields: [],
        sources: [],
      };
      g.fields.push({ label: f.label, value: row.value, sensitive: f.category === "sensitive" });
      if (row.source && !g.sources.includes(row.source)) g.sources.push(row.source);
      groups.set(key, g);
    }
    // Name each prompt from the fields it actually covers on this form.
    const q = [...groups.values()].map((g) => ({ ...g, title: groupTitle(g.key, g.fields.map((f) => f.label)) }));
    setQueue(q);
    setPromptIdx(0);
    setReviewTab("send");
    setPinned(new Set());
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
        rs.map((r) =>
          ids.has(r.fieldId) ? { ...r, value: "", source: null, include: false, denied: true, suggested: false, reason: null } : r,
        ),
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

  /**
   * Hand the result back: postMessage to the opener popup-style, or redirect back in a same-tab flow.
   * A popup that went through Google's sign-in has lost its opener (Google's pages cut the link), but the
   * merchant tab is still polling the session: close this window, or say where to go if it can't close.
   */
  async function finish(status: "completed" | "cancelled", values?: Record<string, string>, suggested: string[] = []) {
    if (!session) return;
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, status, values, suggested }),
    });
    // Never "*": the answers only go to the merchant page that asked (the server checked its origin).
    const target = session.returnUrl ? new URL(session.returnUrl).origin : window.location.origin;
    const type = status === "completed" ? "formly:filled" : "formly:cancelled";
    let wasPopup = false;
    try {
      wasPopup = sessionStorage.getItem(POPUP_KEY) === session.id;
    } catch {}
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type, sessionId: session.id, values, suggested }, target);
      setTimeout(() => window.close(), status === "completed" ? 900 : 0);
    } else if (wasPopup) {
      setTimeout(
        () => {
          window.close();
          setTimeout(() => setOrphaned(true), 300);
        },
        status === "completed" ? 900 : 0,
      );
    } else if (session.returnUrl) {
      const back = new URL(session.returnUrl);
      // A cancel has no answers to bring back, so the merchant page just restores its step (no "Returning…" flash).
      if (status === "completed") back.searchParams.set("formly_session", session.id);
      setTimeout(() => (window.location.href = back.toString()), status === "completed" ? 900 : 0);
    }
  }

  function approve() {
    const sending = rows.filter(willSend);
    const values = Object.fromEntries(sending.map((r) => [r.fieldId, r.value]));
    setStep("sent");
    finish(
      "completed",
      values,
      sending.filter((r) => r.suggested).map((r) => r.fieldId),
    );
  }

  function cancel() {
    finish("cancelled");
  }

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.fieldId === id ? { ...r, ...patch } : r)));

  function toggle(r: Row, include: boolean) {
    setPinned((p) => new Set(p).add(r.fieldId));
    update(r.fieldId, { include });
  }

  function switchTab(tab: "send" | "skip") {
    setReviewTab(tab);
    setPinned(new Set());
  }

  const sendCount = rows.filter(willSend).length;
  const fieldById = new Map((session?.schema.fields ?? []).map((f) => [f.id, f]));
  const isFound = (r: Row) => r.found && !r.denied;
  const tabRows = rows.filter((r) => pinned.has(r.fieldId) || willSend(r) === (reviewTab === "send"));
  /** What the business will still ask for on its own page: never filled (SSN, PIN, consent) or not in the data. */
  // A field the form only asks under another answer (the carrier, when keeping the number) is left out otherwise.
  const askLater = rows.filter((r) => {
    if (isFound(r) || r.denied) return false;
    const cond = fieldById.get(r.fieldId)?.showIf;
    return !cond || rows.find((o) => o.fieldId === cond.field)?.value === cond.value;
  });
  const theme = session?.schema.theme;
  const head = session ? heading(session.schema) : null;
  const fillable = session?.schema.fields.filter((f) => !f.never).length ?? 0;
  const progress = step === "connect" ? 1 : step === "filling" || step === "permissions" ? 2 : 3;
  // Disabled under a theme is the real site's disabled primary (gray fill, gray text), not a faded magenta.
  const primary = theme
    ? "bg-[var(--fy-primary)] text-[var(--fy-primary-text)] enabled:hover:bg-[var(--fy-primary-hover)] disabled:bg-bg disabled:text-[#8C8C8C]"
    : null;

  return (
    <div className="flex flex-1 flex-col bg-white" style={theme ? themeStyle(theme) : undefined}>
      {theme?.fontFaces?.length ? <style dangerouslySetInnerHTML={{ __html: fontFaces(theme) }} /> : null}
      {theme ? (
        // The merchant's transactional header: its logo and the step title, a thin progress bar under it.
        <header className="sticky top-0 z-10 bg-white">
          <div className="flex h-14 items-center gap-6 border-b border-line px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={theme.logo} alt={session!.business} className="h-5 w-auto" />
            <span className="text-base leading-5 font-semibold">{theme.headerTitle}</span>
          </div>
          <div className="h-1 bg-bg" aria-hidden>
            <div className="h-full bg-[var(--fy-primary)] transition-[width]" style={{ width: `${(progress / 3) * 100}%` }} />
          </div>
        </header>
      ) : (
        <header className="flex items-center bg-navy px-5 py-4">
          <Logo light />
        </header>
      )}

      <div className="flex-1 px-4 py-5 sm:px-5">
        {!session || !head ? (
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Loading…
          </div>
        ) : (
          <>
            {!theme && session.schema.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.schema.logo} alt={session.business} className="mb-2 h-6 w-auto" />
            )}
            {/* The global h1 rule (Sora 600) is unlayered, so the merchant's headline weight goes inline. */}
            <h1
              className={theme ? "text-2xl leading-8 tracking-normal" : "text-[28px] leading-tight font-bold"}
              style={theme ? { fontWeight: 800 } : undefined}
            >
              {head.title}
            </h1>
            {head.subtitle && <p className="mt-0.5 text-base text-muted">{head.subtitle}</p>}
            <p className="mt-1 text-sm text-muted">{session.business} only gets the answers you approve.</p>

            {step === "connect" && (
              <div className="mt-5 space-y-5">
                {twinLoaded && !panelOpen && twin && (
                  <div className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                    <CheckIcon className="h-4 w-4 shrink-0 text-brand-dark" stroke={2} />
                    <span className="min-w-0 flex-1 break-words">Using your data from {sourceSummary(sources)}</span>
                    <button
                      onClick={() => setPanelOpen(true)}
                      className={`-my-2 min-h-11 shrink-0 text-sm font-semibold ${
                        theme ? "text-navy underline underline-offset-2" : "text-brand-dark hover:underline"
                      }`}
                    >
                      Change sources
                    </button>
                  </div>
                )}
                {panelOpen && (
                  <ConnectPanel
                    layout="list"
                    onTwin={setTwin}
                    onSources={setSources}
                    onAdded={() => setAutoFill(true)}
                  />
                )}
                {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              </div>
            )}

            {step === "filling" && (
              <div className="mt-12">
                <ProgressStatus label={`Reading your data and filling ${fillable} fields…`} />
                <p className="mt-3 text-xs text-muted">
                  {session.business} won&apos;t see anything until you review and approve it.
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
                <p className="text-sm font-semibold">Review what you&apos;ll send</p>
                <p className="mb-2 text-xs text-muted">
                  {sendCount} of {rows.length} fields
                </p>
                <div className="mb-2 flex gap-1 rounded-xl bg-bg p-1 text-sm">
                  {(
                    [
                      ["send", "Sending", sendCount],
                      ["skip", "Not sending", rows.length - sendCount],
                    ] as const
                  ).map(([id, label, count]) => (
                    <button
                      key={id}
                      onClick={() => switchTab(id)}
                      className={`min-h-11 flex-1 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                        reviewTab === id ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy"
                      }`}
                    >
                      {label} <span className="text-muted">{count}</span>
                    </button>
                  ))}
                </div>
                {tabRows.length === 0 && (
                  <p className="rounded-xl border border-line px-3 py-6 text-center text-sm text-muted">
                    {reviewTab === "send" ? "Nothing will be sent." : "Every field will be sent."}
                  </p>
                )}
                {reviewTab === "skip" && tabRows.some((r) => !isFound(r)) && (
                  <p className="mb-2 text-sm text-muted">
                    {session.business} will ask you for the ones Formly couldn&apos;t find.
                  </p>
                )}
                <ul className="divide-y divide-line rounded-xl border border-line empty:hidden">
                  {tabRows.map((r) => (
                    <li key={r.fieldId} className={`px-3 py-2 ${!isFound(r) || willSend(r) ? "" : "opacity-50"}`}>
                      <div className="flex items-center gap-2">
                        {isFound(r) && (
                          // A 44px tap target around a 20px box.
                          <label className="-my-3 -ml-3 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              checked={r.include}
                              onChange={(e) => toggle(r, e.target.checked)}
                              aria-label={`Send ${r.label}`}
                              className="h-5 w-5 cursor-pointer accent-brand"
                            />
                          </label>
                        )}
                        <span className="flex-1 text-xs font-medium text-muted">
                          {r.label}
                          {r.category === "sensitive" && <LockIcon className="ml-1 inline h-3 w-3 align-[-1px]" />}
                        </span>
                        {isFound(r) && r.suggested && (
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                              theme ? "border-navy text-navy" : "border-amber-300 bg-amber-50 text-amber-800"
                            }`}
                          >
                            Suggested
                          </span>
                        )}
                        {isFound(r) && r.source && (
                          <span className="max-w-[40%] truncate rounded-full bg-bg px-2 py-0.5 text-xs text-muted">
                            {r.source}
                          </span>
                        )}
                        {r.denied && <span className="text-xs text-muted">Not shared</span>}
                      </div>
                      {!isFound(r) && !r.denied && (
                        <p className="mt-0.5 text-xs text-muted">{session.business} will ask you for this</p>
                      )}
                      {isFound(r) && (
                        <div className="mt-1 flex items-start gap-2 pl-10">
                          <p className="flex-1 text-sm whitespace-pre-wrap break-words">
                            {r.suggested && <span className="text-muted">Suggested: </span>}
                            {r.reveal
                              ? fieldById.get(r.fieldId)?.type === "date"
                                ? shownDate(r.value)
                                : r.value
                              : maskValue(r.value)}
                          </p>
                          {r.category === "sensitive" && (
                            <button
                              onClick={() => update(r.fieldId, { reveal: !r.reveal })}
                              className="text-xs text-muted"
                            >
                              {r.reveal ? "Hide" : "Show"}
                            </button>
                          )}
                        </div>
                      )}
                      {isFound(r) && r.suggested && r.reason && (
                        <p className="mt-0.5 pl-10 text-xs text-muted">because {r.reason}</p>
                      )}
                      {isFound(r) && r.maxWords && (
                        <p className="mt-1 pl-10 text-xs text-muted">
                          {countWords(r.value)}/{r.maxWords} words
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {reviewTab === "send" && askLater.length > 0 && (
                  <div className="mt-3 rounded-xl bg-bg px-3 py-2.5">
                    <p className="text-sm font-semibold">{session.business} will ask you for these</p>
                    <p className="mt-0.5 text-xs text-muted">{askLater.map((r) => r.label).join(", ")}</p>
                  </div>
                )}
              </div>
            )}

            {step === "sent" && (
              <div className="mt-16 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white">
                  <CheckIcon className="h-6 w-6" stroke={2} />
                </div>
                <p className="font-semibold">{orphaned ? `Sent to ${session.business}` : `Returning to ${session.business}`}</p>
                {orphaned && (
                  <p className="mt-2 text-sm text-muted">
                    Your {session.business} form is filled in the other window. You can close this one.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {session && (step === "connect" || step === "review") && (
        <footer className="sticky bottom-0 border-t border-line bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5">
          {step === "review" && (
            <label className="mb-1 flex min-h-11 items-center gap-1 text-sm text-muted">
              Sharing:
              <select
                value={mode}
                onChange={(e) => changeMode(e.target.value as SharingMode)}
                className="min-h-11 min-w-0 cursor-pointer rounded bg-transparent text-sm font-semibold text-navy outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {mode === "all" && <WarningIcon className="h-3 w-3 text-amber-600" stroke={1.25} />}
            </label>
          )}
          <div className="flex gap-2">
            <button
              onClick={cancel}
              className="min-h-12 rounded-xl px-4 text-base font-semibold text-muted transition-colors hover:bg-bg"
            >
              Cancel
            </button>
            {step === "connect" ? (
              <button
                onClick={fill}
                disabled={!twin}
                className={`min-h-12 flex-1 rounded-xl text-base font-semibold transition-colors ${
                  primary ?? "bg-navy text-white enabled:hover:bg-black disabled:opacity-40"
                }`}
              >
                {twin || !twinLoaded
                  ? "Fill my form"
                  : sources.length
                    ? "Build your twin to continue"
                    : "Add your info to continue"}
              </button>
            ) : (
              <button
                onClick={approve}
                disabled={sendCount === 0}
                className={`min-h-12 flex-1 rounded-xl text-base font-semibold transition-colors ${
                  primary ?? "bg-brand text-navy enabled:hover:bg-brand/90 disabled:opacity-40"
                }`}
              >
                Send {sendCount} field{sendCount === 1 ? "" : "s"}
              </button>
            )}
          </div>
          {theme && (
            <p className="mt-2 flex items-center justify-center gap-1 text-xs leading-4 text-muted">
              <Mark className="h-3 w-3" />
              Powered by Formly
            </p>
          )}
        </footer>
      )}
    </div>
  );
}
