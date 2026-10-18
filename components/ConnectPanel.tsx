"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectorLogo } from "./ConnectorLogo";
import { AppleConsent } from "./AppleConsent";
import { GoogleConsent } from "./GoogleConsent";
import { FINISH_MS, ProgressStatus, type ProgressTask } from "./ProgressStatus";
import { ArrowRightIcon, CheckIcon, CloseIcon, LockIcon } from "./Icons";
import type { Twin } from "@/lib/types";

interface SourceRow {
  id: string;
  connector: string;
  name: string;
  chars: number;
  created_at: number;
}

interface Connector {
  name: string;
  /** Simple Icons slug, served from cdn.simpleicons.org. */
  slug: string;
  category: string;
}

/** Live account connectors: each has a mock sign-in sheet and an /api/connectors/<id> sync route. */
interface AccountConnector extends Connector {
  id: "google" | "icloud";
  /** How many scopes the sign-in sheet offers, so "all of them" can read as "your <name> data". */
  scopeCount: number;
}

const GOOGLE: AccountConnector = { id: "google", name: "Google", slug: "google", category: "Accounts", scopeCount: 4 };
const ICLOUD: AccountConnector = { id: "icloud", name: "iCloud", slug: "icloud", category: "Accounts", scopeCount: 6 };
const ACCOUNTS = [GOOGLE, ICLOUD];
const accountFor = (connector: string) => ACCOUNTS.find((a) => a.id === connector);

/** Placeholders for now; Upload, Google and iCloud are the live sources. */
const COMING_SOON: Connector[] = [
  { name: "Dropbox", slug: "dropbox", category: "Email & files" },
  { name: "Apple Wallet", slug: "applepay", category: "Accounts" },
  { name: "Box", slug: "box", category: "Email & files" },
  { name: "Notion", slug: "notion", category: "Email & files" },
  { name: "Evernote", slug: "evernote", category: "Email & files" },
  { name: "Chase", slug: "chase", category: "Banking & finance" },
  { name: "Bank of America", slug: "bankofamerica", category: "Banking & finance" },
  { name: "Wells Fargo", slug: "wellsfargo", category: "Banking & finance" },
  { name: "American Express", slug: "americanexpress", category: "Banking & finance" },
  { name: "PayPal", slug: "paypal", category: "Banking & finance" },
  { name: "Venmo", slug: "venmo", category: "Banking & finance" },
  { name: "Robinhood", slug: "robinhood", category: "Banking & finance" },
  { name: "Coinbase", slug: "coinbase", category: "Banking & finance" },
  { name: "Intuit", slug: "intuit", category: "Banking & finance" },
  { name: "Uber", slug: "uber", category: "Travel & more" },
  { name: "Airbnb", slug: "airbnb", category: "Travel & more" },
  { name: "GitHub", slug: "github", category: "Travel & more" },
];

/** How many placeholder tiles sit next to Upload, Google and iCloud before the "+N more" tile. */
const FEATURED = 0;


/** Data-source connectors. Upload is live; the rest are placeholders for now. */
export function ConnectPanel({ onTwin }: { onTwin?: (twin: Twin | null) => void }) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busy, setBusy] = useState<ProgressTask | null>(null);

  /** Show the bar reaching 100% for a beat, then hide it. */
  async function finishBusy() {
    setBusy((b) => b && { ...b, done: true });
    await new Promise((r) => setTimeout(r, FINISH_MS));
    setBusy(null);
  }
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [consent, setConsent] = useState<AccountConnector | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<AccountConnector | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setSources(await fetch("/api/sources").then((r) => r.json()));
  }, []);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then(setSources);
  }, []);

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    const many = files.length > 1;
    setBusy({
      steps: [
        `Uploading ${many ? `${files.length} files` : "your file"}…`,
        `Reading ${many ? "them" : "it"}…`,
        "Building your digital twin…",
        "Double-checking key facts…",
        "Almost done…",
      ],
      expectedMs: 8000 + 4000 * files.length,
    });
    setError(null);
    const body = new FormData();
    for (const f of files) body.append("files", f);
    try {
      const res = await fetch("/api/sources", { method: "POST", body }).then((r) => r.json());
      if (res.errors?.length) setError(res.errors.join("; "));
      if (res.error) setError(res.error);
      else onTwin?.(res.twin ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
    await refresh();
    await finishBusy();
  }

  async function connectAccount(c: AccountConnector, scopes: string[], account: string) {
    setConsent(null);
    setBusy({
      steps: [
        `Connecting to ${c.name}…`,
        `Syncing ${scopes.length === c.scopeCount ? `your ${c.name} data` : scopes.join(", ")}…`,
        "Building your digital twin…",
        "Double-checking key facts…",
        "Almost done…",
      ],
      expectedMs: 5000,
    });
    setError(null);
    try {
      const res = await fetch(`/api/connectors/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes, account }),
      }).then((r) => r.json());
      if (res.error) setError(res.error);
      else onTwin?.(res.twin ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
    await refresh();
    await finishBusy();
  }

  const isSynced = (c: AccountConnector) => sources.some((s) => s.connector === c.id);

  async function disconnect(c: AccountConnector) {
    setDisconnecting(null);
    setBusy({
      steps: [`Disconnecting ${c.name}…`, "Rebuilding your digital twin…", "Almost done…"],
      expectedMs: 3500,
    });
    setError(null);
    const res = await fetch(`/api/sources?connector=${c.id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.error) setError(res.error);
    else onTwin?.(res.twin ?? null);
    await refresh();
    await finishBusy();
  }

  /** Account tile/row: connect if not synced, otherwise offer to disconnect. */
  function openAccount(c: AccountConnector) {
    if (isSynced(c)) setDisconnecting(c);
    else setConsent(c);
  }

  async function remove(id: string) {
    setBusy({ steps: ["Removing the source…", "Rebuilding your digital twin…", "Almost done…"], expectedMs: 3500 });
    const res = await fetch(`/api/sources?id=${id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.error) setError(res.error);
    else onTwin?.(res.twin ?? null);
    await refresh();
    await finishBusy();
  }

  const tile = "flex flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-3 transition";

  return (
    <div className="space-y-4">
      {uploadOpen && (
        <Modal title="Upload files" onClose={() => setUploadOpen(false)}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              setUploadOpen(false);
              upload(e.dataTransfer.files);
            }}
            onClick={() => input.current?.click()}
            className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              drag ? "border-brand bg-brand/10" : "border-line hover:border-brand hover:bg-brand/5"
            }`}
          >
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand-dark">
              <UploadIcon />
            </span>
            <div className="text-sm font-semibold">Drop files or click to upload</div>
            <div className="mt-1 text-xs text-muted">PDF, images, DOCX, TXT, CSV, JSON</div>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.docx,.txt,.md,.csv,.json"
              onChange={(e) => {
                setUploadOpen(false);
                if (e.target.files) upload(e.target.files);
              }}
            />
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
            <LockIcon className="h-2.5 w-2.5" stroke={1.25} /> Secure with Formly
          </p>
        </Modal>
      )}

      {consent?.id === "google" && (
        <GoogleConsent onAllow={(scopes, account) => connectAccount(GOOGLE, scopes, account)} onCancel={() => setConsent(null)} />
      )}
      {consent?.id === "icloud" && (
        <AppleConsent onAllow={(scopes, account) => connectAccount(ICLOUD, scopes, account)} onCancel={() => setConsent(null)} />
      )}

      {disconnecting && (
        <Modal title={`Disconnect ${disconnecting.name}?`} onClose={() => setDisconnecting(null)}>
          <div className="flex items-start gap-3">
            <ConnectorLogo slug={disconnecting.slug} className="mt-0.5 h-8 w-8 shrink-0" />
            <p className="text-sm text-muted">
              Formly will remove the data it synced from your {disconnecting.name} account and rebuild your digital
              twin without it. You can reconnect any time.
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setDisconnecting(null)}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-bg"
            >
              Cancel
            </button>
            <button
              onClick={() => disconnect(disconnecting)}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Disconnect
            </button>
          </div>
        </Modal>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Add a source</p>
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => setUploadOpen(true)}
            disabled={!!busy}
            className={`${tile} border-transparent shadow-surface hover:shadow-surface-hover`}
          >
            <span className="flex h-6 w-6 items-center justify-center text-navy">
              <UploadIcon className="h-5 w-5" />
            </span>
            <span className="w-full truncate text-[11px] font-medium">Upload</span>
          </button>
          {ACCOUNTS.map((c) => (
            <button
              key={c.id}
              onClick={() => openAccount(c)}
              disabled={!!busy}
              className={`${tile} ${isSynced(c) ? "border-brand bg-brand/5" : "border-transparent shadow-surface hover:shadow-surface-hover"}`}
            >
              <span className="relative">
                <ConnectorLogo slug={c.slug} />
                {isSynced(c) && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand text-white ring-2 ring-white">
                    <CheckIcon className="h-2.5 w-2.5" />
                  </span>
                )}
              </span>
              <span className="w-full truncate text-[11px] font-medium">{c.name}</span>
            </button>
          ))}
          {COMING_SOON.slice(0, FEATURED).map((c) => (
            <button key={c.name} type="button" className={`${tile} border-transparent shadow-surface hover:shadow-surface-hover`}>
              <ConnectorLogo slug={c.slug} />
              <span className="w-full truncate text-center text-[11px] font-medium">{c.name}</span>
            </button>
          ))}
          <button onClick={() => setMoreOpen(true)} className={`${tile} border-transparent shadow-surface hover:shadow-surface-hover`}>
            <span className="flex h-6 items-center text-base font-bold">+{COMING_SOON.length - FEATURED}</span>
            <span className="w-full truncate text-[11px] text-muted">More</span>
          </button>
        </div>
      </div>

      {moreOpen && (
        <Modal title="Add a source" wide onClose={() => setMoreOpen(false)}>
          <div className="-mx-2 -mb-2 max-h-[60vh] space-y-4 overflow-y-auto overscroll-contain px-2 pt-0.5 pb-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Files</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    setUploadOpen(true);
                  }}
                  disabled={!!busy}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm shadow-surface transition hover:shadow-surface-hover"
                >
                  <UploadIcon className="h-5 w-5" />
                  <span className="flex-1 truncate font-medium">Upload files</span>
                </button>
              </div>
            </div>
            {[...new Set([...ACCOUNTS, ...COMING_SOON].map((c) => c.category))].map((cat) => (
              <div key={cat}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{cat}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[...ACCOUNTS, ...COMING_SOON]
                    .filter((c) => c.category === cat)
                    .map((c) => {
                      const live = ACCOUNTS.find((a) => a === c);
                      return live ? (
                        <button
                          key={c.name}
                          onClick={() => {
                            setMoreOpen(false);
                            openAccount(live);
                          }}
                          disabled={!!busy}
                          className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm shadow-surface transition hover:shadow-surface-hover"
                        >
                          <ConnectorLogo slug={c.slug} className="h-5 w-5" />
                          <span className="flex-1 truncate font-medium">{c.name}</span>
                          {isSynced(live) && <span className="text-xs text-brand-dark">Synced</span>}
                        </button>
                      ) : (
                        <button
                          key={c.name}
                          type="button"
                          className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm shadow-surface transition hover:shadow-surface-hover"
                        >
                          <ConnectorLogo slug={c.slug} className="h-5 w-5" />
                          <span className="flex-1 truncate font-medium">{c.name}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {busy && (
        <ProgressStatus task={busy} className="rounded-lg bg-brand/10 px-3 py-2.5" />
      )}
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {sources.length > 0 && (
        <button
          onClick={() => setSourcesOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm shadow-surface transition hover:shadow-surface-hover"
        >
          <span className="flex -space-x-1.5">
            {[...new Set(sources.map((s) => s.connector))].map((c) => (
              <span key={c} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-bg">
                {accountFor(c) ? <ConnectorLogo slug={accountFor(c)!.slug} className="h-3 w-3" /> : <FileIcon />}
              </span>
            ))}
          </span>
          <span className="flex-1 font-medium">
            {sources.length} source{sources.length === 1 ? "" : "s"} connected
          </span>
          <span className="flex items-center gap-1 text-xs text-muted">
            Manage <ArrowRightIcon />
          </span>
        </button>
      )}

      {sourcesOpen && (
        <Modal title="Connected sources" onClose={() => setSourcesOpen(false)}>
          {sources.length === 0 ? (
            <p className="text-sm text-muted">No sources yet.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto overscroll-contain rounded-xl border border-line">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg">
                    {accountFor(s.connector) ? (
                      <ConnectorLogo slug={accountFor(s.connector)!.slug} className="h-3.5 w-3.5" />
                    ) : (
                      <FileIcon />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {accountFor(s.connector) ? `Synced from ${accountFor(s.connector)!.name}` : "Uploaded"} on{" "}
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <button
                    onClick={() => remove(s.id)}
                    disabled={!!busy}
                    className="text-xs text-muted transition-colors hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-2xl bg-white p-5 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-m-1 p-1 text-muted transition-colors hover:text-navy"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="icon-line h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round">
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5" />
    </svg>
  );
}

function UploadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`icon-line ${className}`} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
    </svg>
  );
}

export function Spinner() {
  // Reduced motion swaps the spin for an opacity pulse.
  return (
    <span className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-pulse" />
  );
}
