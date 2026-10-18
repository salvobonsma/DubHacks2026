"use client";

import { useCallback, useEffect, useState } from "react";

interface Race {
  startedAt: number | null;
  aStoppedAt: number | null;
  bFinishedAt: number | null;
  bFields: number | null;
  bTotal: number | null;
  bTyped: number | null;
  wipeSince: number | null;
}

interface Qr {
  url: string;
  image: string;
  phoneReachable?: boolean;
}

interface Wiped {
  deleted: number;
  tables: Record<string, number>;
  revoked: number;
  since: number | null;
}

const EMPTY: Race = {
  startedAt: null,
  aStoppedAt: null,
  bFinishedAt: null,
  bFields: null,
  bTotal: null,
  bTyped: null,
  wipeSince: null,
};

/** What each wiped table holds, in plain words for the room. */
const TABLE_WORDS: Record<string, string> = {
  sources: "uploaded files",
  twin: "profiles",
  twins: "profiles",
  sessions: "form sessions",
  session_results: "form sessions",
  oauth_states: "sign-ins",
  oauth_tokens: "sign-ins",
  grants: "sharing choices",
  scan_tokens: "phone scans",
  logins: "saved logins",
};

/** {sources: 2, twin: 1, sessions: 3} -> "uploaded files, profiles and form sessions". */
function plainTables(tables: Record<string, number>): string {
  const words = [...new Set(Object.keys(tables).map((t) => TABLE_WORDS[t] ?? (/plaid|bank/.test(t) ? "bank links" : "other records")))];
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** 83400 -> "1:23.4", the clock face. */
function clock(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const tenths = Math.floor((t % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${tenths}`;
}

/** 221000 -> "3m 41s"; under a minute keeps tenths, "41.2s". */
function gap(ms: number): string {
  const t = Math.abs(ms);
  if (t < 60000) return `${(t / 1000).toFixed(1)}s`;
  const m = Math.floor(t / 60000);
  const s = Math.round((t % 60000) / 1000);
  return s ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Laptop page for the race. Judge A types their own details on the real t-mobile.com and the operator taps Stop
 * at the credit check. Judge B fills /tmobile?race=1 with Formly, and that page stops B's clock itself when it
 * reaches the credit check. State lives on the server (GET /api/race, polled every 500 ms).
 */
export function RaceBoard() {
  const [race, setRace] = useState<Race>(EMPTY);
  const [offset, setOffset] = useState(0);
  const [qr, setQr] = useState<{ a: Qr; b: Qr } | null>(null);
  const [ttl, setTtl] = useState("1 hour");
  // Ticks every 100 ms once mounted (0 before that: Date.now() can't run during the prerender).
  const [now, setNow] = useState(0);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wiped, setWiped] = useState<Wiped | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A Stop tap shows at once; the server's time replaces it on the next poll. */
  const [localStop, setLocalStop] = useState<number | null>(null);

  const take = useCallback((d: { race?: Race; now?: number; ttl?: string }) => {
    if (d.race) setRace(d.race);
    if (typeof d.now === "number") setOffset(d.now - Date.now());
    if (d.ttl) setTtl(d.ttl);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/race?qr=1")
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        take(d);
        setQr(d.qr);
      })
      .catch(() => setError("Couldn't reach the race server."));
    const poll = setInterval(() => {
      fetch("/api/race")
        .then((r) => r.json())
        .then((d) => {
          if (!live) return;
          take(d);
          setError(null);
        })
        .catch(() => live && setError("Lost the race server. Retrying…"));
    }, 500);
    const tick = setInterval(() => setNow(Date.now()), 100);
    return () => {
      live = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [take]);

  const serverNow = now + offset;
  const aStop = race.aStoppedAt ?? (race.startedAt ? localStop : null);
  const running = race.startedAt !== null;
  const aTime = race.startedAt && (aStop || now) ? (aStop ?? serverNow) - race.startedAt : 0;
  const bTime = race.startedAt && (race.bFinishedAt || now) ? (race.bFinishedAt ?? serverNow) - race.startedAt : 0;
  const bothDone = running && aStop !== null && race.bFinishedAt !== null;

  async function call(method: "POST" | "DELETE", body?: object, query = "") {
    setBusy(true);
    try {
      const r = await fetch(`/api/race${query}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      take(d);
      return d;
    } catch {
      setError("Couldn't reach the race server.");
    } finally {
      setBusy(false);
    }
  }

  function start() {
    setLocalStop(null);
    setWiped(null);
    setConfirmWipe(false);
    call("POST", { action: "start" });
  }

  function stop() {
    setLocalStop(Date.now() + offset);
    call("POST", { action: "stop-a" });
  }

  function newRace() {
    setLocalStop(null);
    setConfirmWipe(false);
    call("DELETE");
  }

  async function wipe() {
    setLocalStop(null);
    const d = (await call("DELETE", undefined, "?wipe=1")) as Wiped | undefined;
    setConfirmWipe(false);
    if (d && typeof d.deleted === "number") {
      setWiped(d);
      setRace(EMPTY);
    }
  }

  const total = race.bTotal;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[var(--tm-bg-secondary)]">
      <header className="tm-header">
        {/* The T-Mobile logo stands alone with its clear space; Formly is named on the right, never as a lockup. */}
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-12 px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tmobile/logo.png" alt="T-Mobile" className="h-6 w-auto md:h-8" />
          <div className="ml-auto flex items-center gap-3">
            <span className="tm-secondary text-sm font-semibold">Race with Formly</span>
            <span className="tm-chip hidden sm:inline-block">{running ? (bothDone ? "Finished" : "Race on") : "Ready"}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="tm-h1 tm-display">The T-Mobile signup race</h1>
            <p className="tm-secondary mt-2 text-lg">
              Same signup, two ways. Both judges use their own details and stop at the credit check. Nobody enters a
              Social Security number.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            {!running && (
              <button type="button" onClick={start} disabled={busy} className="tm-btn tm-btn-primary tm-btn-hero min-w-56 text-lg">
                Start race
              </button>
            )}
            {running && (
              <button
                type="button"
                onClick={newRace}
                disabled={busy}
                className={`tm-btn ${bothDone ? "tm-btn-primary" : "tm-btn-secondary"} tm-btn-hero min-w-40`}
              >
                New race
              </button>
            )}
            {!confirmWipe ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmWipe(true);
                  setWiped(null);
                }}
                disabled={busy}
                className="tm-btn tm-btn-secondary tm-btn-hero min-w-40"
              >
                End and wipe
              </button>
            ) : (
              <div className="tm-card flex flex-wrap items-center gap-3 px-4 py-3" role="alertdialog" aria-label="Confirm wipe">
                <span className="text-[15px]">Delete every judge&apos;s data from this race? This can&apos;t be undone.</span>
                <button type="button" onClick={wipe} disabled={busy} className="tm-btn tm-btn-secondary">
                  Delete judges&apos; data
                </button>
                <button type="button" onClick={() => setConfirmWipe(false)} className="tm-btn tm-btn-tertiary">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="tm-error mt-4" role="alert">
            {error}
          </p>
        )}

        {wiped && (
          <p className="tm-notice mt-4" role="status">
            {wiped.since === null
              ? "Nothing to delete. No race has started since the last wipe."
              : `Deleted ${wiped.deleted} item${wiped.deleted === 1 ? "" : "s"} of judges' data${
                  Object.keys(wiped.tables).length ? `: ${plainTables(wiped.tables)}` : ""
                }.${wiped.revoked ? ` Google access revoked for ${wiped.revoked} account${wiped.revoked === 1 ? "" : "s"}.` : ""}`}
          </p>
        )}

        {bothDone && (
          <div className="tm-card mt-6 text-center" role="status">
            <p className="tm-num text-[40px] leading-tight lg:text-[56px]">
              {aTime > bTime
                ? `Formly was ${gap(aTime - bTime)} faster`
                : aTime < bTime
                  ? `Typing by hand was ${gap(bTime - aTime)} faster`
                  : "A dead heat"}
            </p>
            <p className="tm-secondary mt-2 text-lg">
              By hand {clock(aTime)} · With Formly {clock(bTime)}
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="tm-card flex flex-col" aria-labelledby="judge-a">
            <span className="tm-chip w-fit">Judge A</span>
            <h2 id="judge-a" className="tm-h2 tm-display mt-3">
              By hand on t-mobile.com
            </h2>
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
              <QrBox qr={qr?.a} label="Scan for t-mobile.com" />
              <ol className="space-y-2 text-lg">
                <li>1. Scan and pick a plan.</li>
                <li>2. Type your own details.</li>
                <li>3. Stop at the credit check. Don&apos;t submit it.</li>
              </ol>
            </div>
            <p className="tm-num mt-6 text-[72px] leading-none lg:text-[88px]" aria-live="off">
              {clock(aTime)}
            </p>
            <p className="tm-secondary mt-2 min-h-7 text-lg">
              {!running
                ? "Waiting to start"
                : aStop !== null
                  ? "Stopped at the credit check"
                  : "Tap Stop when Judge A reaches the credit check"}
            </p>
            <div className="mt-auto pt-4">
              {running && aStop === null ? (
                <button type="button" onClick={stop} className="tm-btn tm-btn-primary h-20 w-full text-[28px] font-bold">
                  Stop Judge A
                </button>
              ) : (
                <div className="h-20" aria-hidden />
              )}
            </div>
          </section>

          <section className="flex flex-col rounded-[12px] bg-navy p-6 text-white" aria-labelledby="judge-b">
            <span className="w-fit rounded-[24px] bg-white/10 px-2.5 py-0.5 text-xs font-bold">Judge B</span>
            <h2 id="judge-b" className="mt-3 font-display text-[20px] leading-7 font-semibold lg:text-[32px] lg:leading-10">
              With Formly
            </h2>
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
              <QrBox qr={qr?.b} label="Scan for the Formly signup" />
              <ol className="space-y-2 text-lg text-white/85">
                <li>1. Scan and tap Fill it in for me.</li>
                <li>2. Connect your own data and approve.</li>
                <li>3. Continue to the credit check. The clock stops itself.</li>
              </ol>
            </div>
            {qr?.b && !qr.b.phoneReachable && (
              <p className="mt-4 rounded-[2px] bg-white/10 px-3 py-2 text-sm">
                Phones can&apos;t open localhost. Set PUBLIC_ORIGIN, or open this page at the laptop&apos;s Wi-Fi address.
              </p>
            )}
            <p className="mt-6 font-display text-[72px] leading-none font-semibold tabular-nums lg:text-[88px]" aria-live="off">
              {clock(bTime)}
            </p>
            <p className="mt-2 min-h-7 text-lg text-white/75">
              {!running
                ? "Waiting to start"
                : race.bFinishedAt !== null
                  ? `Finished · ${race.bFields ?? 0} of ${total ?? 0} fields filled by Formly${race.bTyped ? `, ${race.bTyped} typed` : ""}`
                  : "Stops by itself at the credit check"}
            </p>
            <div className="mt-auto pt-4">
              <div className="h-20" aria-hidden />
            </div>
          </section>
        </div>

        <p className="tm-secondary mt-6">
          Judges&apos; data is deleted after each race, and it deletes itself automatically after {ttl} anyway.
        </p>
      </main>
    </div>
  );
}

function QrBox({ qr, label }: { qr?: Qr; label: string }) {
  return (
    <figure className="flex-none">
      <div className="flex h-[184px] w-[184px] items-center justify-center rounded-[12px] bg-white p-3 lg:h-[200px] lg:w-[200px]">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr.image} alt={label} className="h-full w-full" />
        ) : (
          <div className="tm-spinner" aria-label="Loading QR code" />
        )}
      </div>
      <figcaption className="mt-2 max-w-[200px] text-xs break-all opacity-75">{qr?.url ?? " "}</figcaption>
    </figure>
  );
}
