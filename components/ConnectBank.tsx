"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Twin } from "@/lib/types";
import { CheckIcon, WarningIcon } from "./Icons";

// ---------- Plaid Link (loaded on demand, no npm package) ----------

const LINK_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

interface PlaidLinkError {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
}
interface PlaidHandler {
  open(): void;
  exit(opts?: { force?: boolean }): void;
  destroy(): void;
}
interface PlaidLink {
  create(config: {
    token: string;
    receivedRedirectUri?: string;
    onSuccess: (publicToken: string, metadata: { institution?: { name?: string | null } | null }) => void;
    onExit?: (error: PlaidLinkError | null, metadata: unknown) => void;
  }): PlaidHandler;
}
declare global {
  interface Window {
    Plaid?: PlaidLink;
  }
}

let script: Promise<PlaidLink> | null = null;

/** Load Plaid's Link script once, when the user first taps the bank button. */
export function loadPlaidLink(): Promise<PlaidLink> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  script ??= new Promise<PlaidLink>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LINK_SCRIPT;
    s.async = true;
    s.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("Plaid didn't load")));
    s.onerror = () => {
      script = null;
      s.remove();
      reject(new Error("Couldn't load the bank connection. Check your internet and try again."));
    };
    document.head.appendChild(s);
  });
  return script;
}

/**
 * The link token survives the OAuth-bank round trip (Chase, Bank of America… send the phone to the bank's site or
 * app and back to /formly/plaid-oauth), where Link has to be reopened with the same token. Same browser only.
 */
const PENDING_KEY = "formly_plaid_link";
const PENDING_MAX_MS = 30 * 60_000;

export function savePendingLink(token: string, returnTo: string) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ token, returnTo, at: Date.now() }));
  } catch {}
}

export function takePendingLink(): { token: string; returnTo: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const p = raw ? (JSON.parse(raw) as { token?: string; returnTo?: string; at?: number }) : null;
    if (!p?.token || !p.at || Date.now() - p.at > PENDING_MAX_MS) return null;
    return { token: p.token, returnTo: safePath(p.returnTo) };
  } catch {
    return null;
  }
}

export function clearPendingLink() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}

/** Same-site relative paths only; anything else goes to /formly. */
export function safePath(path: string | undefined | null): string {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/formly";
}

interface Choose {
  owners: string[];
  profileName: string | null;
  institution: string;
}
export type BankResult =
  | { status: "imported"; owner: string | null; institution: string; twin: Twin | null; error?: string }
  | ({ status: "choose" } & Choose)
  | { status: "removed"; twin: Twin | null }
  | { status: "failed"; error: string };

async function post(url: string, body: unknown): Promise<BankResult> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ error: "Something went wrong." }));
    // A 500 after "imported" means the bank data is saved but the twin rebuild failed: still imported.
    if (data.status) return data as BankResult;
    return { status: "failed", error: data.error ?? "Something went wrong." };
  } catch {
    return { status: "failed", error: "Couldn't reach Formly. Check your internet and try again." };
  }
}

/** Link succeeded: swap the public token and read the bank (identity + recurring charges). Can take ~30 s. */
export function finishPlaid(publicToken: string, institution: string | null | undefined): Promise<BankResult> {
  return post("/api/connectors/plaid/exchange", { public_token: publicToken, institution: institution ?? null });
}

// ---------- The button ----------

type Status = { configured: false } | { configured: true; connected: boolean; institution?: string; choose?: Choose };

/**
 * "Connect your bank" (Plaid). Renders nothing when Plaid isn't set up on the server: never a fake button.
 * Tapping it opens Plaid Link over the page; OAuth banks on a phone go to the bank and come back through
 * /formly/plaid-oauth, which returns to this page with ?connected=plaid. If the bank lists someone other than
 * the Google profile's person (or several people), it asks "which of these is you?" before anything is saved.
 * onConnected runs with the rebuilt twin once the bank's data is in.
 */
export function ConnectBank({
  onConnected,
  onDisconnected,
  returnTo,
  className = "",
}: {
  onConnected?: (twin: Twin | null) => void;
  onDisconnected?: (twin: Twin | null) => void;
  /** Where the OAuth-bank round trip lands. Defaults to the current page (path + query). */
  returnTo?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef<PlaidHandler | null>(null);
  const connected = useRef(onConnected);
  useEffect(() => {
    connected.current = onConnected;
  }, [onConnected]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/plaid", { cache: "no-store" });
      setStatus(res.ok ? ((await res.json()) as Status) : { configured: false });
    } catch {
      setStatus({ configured: false });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connectors/plaid", { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as Status) : { configured: false as const };
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus({ configured: false });
      }
    })();
    return () => {
      cancelled = true;
      handler.current?.destroy();
    };
  }, []);

  const settle = useCallback(
    (r: BankResult) => {
      setBusy(null);
      if (r.status === "failed") {
        setError(r.error);
        return;
      }
      if (r.status === "choose") {
        setStatus({ configured: true, connected: false, institution: r.institution, choose: r });
        return;
      }
      if (r.status === "removed") {
        setStatus({ configured: true, connected: false });
        onDisconnected?.(r.twin);
        return;
      }
      setStatus({ configured: true, connected: true, institution: r.institution });
      if (r.error) setError(r.error);
      connected.current?.(r.twin);
    },
    [onDisconnected],
  );

  async function connect() {
    setError(null);
    setBusy("Opening your bank…");
    try {
      const res = await fetch("/api/connectors/plaid/link-token", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { link_token?: string; error?: string };
      if (!res.ok || !data.link_token) throw new Error(data.error ?? "Couldn't start the bank connection.");
      const Plaid = await loadPlaidLink();
      savePendingLink(data.link_token, safePath(returnTo ?? window.location.pathname + window.location.search));
      handler.current?.destroy();
      handler.current = Plaid.create({
        token: data.link_token,
        onSuccess: async (publicToken, metadata) => {
          clearPendingLink();
          setBusy("Reading your bank details…");
          settle(await finishPlaid(publicToken, metadata.institution?.name));
        },
        onExit: (err) => {
          clearPendingLink();
          setBusy(null);
          if (err) setError(err.display_message || err.error_message || "The bank connection didn't finish. Try again.");
        },
      });
      handler.current.open();
    } catch (e) {
      setBusy(null);
      setError((e as Error).message);
    }
  }

  async function choose(owner: number | null) {
    setError(null);
    setBusy(owner === null ? "Disconnecting your bank…" : "Adding your bank details…");
    settle(await post("/api/connectors/plaid/owner", { owner }));
  }

  async function disconnect() {
    setError(null);
    setBusy("Disconnecting your bank…");
    try {
      const res = await fetch("/api/connectors/plaid", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { twin?: Twin | null; error?: string };
      if (!res.ok) setError(data.error ?? "Couldn't disconnect your bank.");
      onDisconnected?.(data.twin ?? null);
    } catch {
      setError("Couldn't reach Formly. Check your internet and try again.");
    }
    setBusy(null);
    await refresh();
  }

  if (!status || !status.configured) return null;

  const errorLine = error && (
    <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
      <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
    </p>
  );

  if (status.choose) {
    const c = status.choose;
    const one = c.owners.length === 1;
    return (
      <div className={className}>
        <section className="rounded-xl bg-white p-4 shadow-surface" aria-labelledby="bank-choose-title">
          <h3 id="bank-choose-title" className="text-sm font-semibold">
            {one ? `Is ${c.owners[0]} you?` : "Which of these is you?"}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {c.profileName
              ? `Your Google account is ${c.profileName}, and ${c.institution} lists ${one ? "a different name" : "these people"}. `
              : `${c.institution} lists more than one person on these accounts. `}
            Formly only uses one person&apos;s details.
          </p>
          <div className="mt-3 space-y-2">
            {c.owners.map((name, i) => (
              <button
                key={`${name}-${i}`}
                onClick={() => choose(i)}
                disabled={!!busy}
                className="flex min-h-11 w-full items-center rounded-xl border border-line px-3 text-left text-sm font-medium transition hover:border-brand disabled:opacity-60"
              >
                {one ? `Yes, ${name} is me` : name}
              </button>
            ))}
            <button
              onClick={() => choose(null)}
              disabled={!!busy}
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-muted transition hover:bg-bg disabled:opacity-60"
            >
              {one ? "No, disconnect the bank" : "None of these, disconnect the bank"}
            </button>
          </div>
          {busy && <p className="mt-2 text-xs text-muted">{busy}</p>}
          {errorLine}
        </section>
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className={className}>
        <div className="flex min-h-14 items-center gap-3 rounded-xl border border-brand bg-brand/5 px-3 py-2">
          <BankMark connected />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{status.institution ?? "Your bank"} connected</span>
            <span className="block text-xs text-muted">{busy ?? "Name, address, phone and recurring bills"}</span>
          </span>
          <button
            onClick={disconnect}
            disabled={!!busy}
            className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-navy transition-colors hover:bg-bg disabled:opacity-60"
          >
            Disconnect
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        onClick={connect}
        disabled={!!busy}
        aria-busy={!!busy}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-2 text-left shadow-surface transition hover:shadow-surface-hover disabled:opacity-70"
      >
        <BankMark />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{busy ?? "Connect your bank"}</span>
          <span className="block text-xs text-muted">Name, address and phone, plus recurring bills. Never your balance.</span>
        </span>
      </button>
      {errorLine}
    </div>
  );
}

/** A bank building in a navy circle (green with a check once connected). */
function BankMark({ connected = false }: { connected?: boolean }) {
  return (
    <span
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${connected ? "bg-brand text-white" : "bg-navy text-white"}`}
    >
      {connected ? (
        <CheckIcon className="h-4 w-4" stroke={2} />
      ) : (
        <svg viewBox="0 0 24 24" className="icon-line h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 9.5 12 4l9 5.5M5 10v8M9.67 10v8M14.33 10v8M19 10v8M3 20h18" />
        </svg>
      )}
    </span>
  );
}
