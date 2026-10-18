"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectorLogo } from "./ConnectorLogo";
import { GoogleConsent, type GoogleScope } from "./GoogleConsent";
import { ArrowRightIcon, CheckIcon, CloseIcon } from "./Icons";
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

const GOOGLE: Connector = { name: "Google", slug: "google", category: "Accounts" };

/** Placeholders for now; only Google (profile, contacts, Gmail, Drive) and file upload are wired up. */
const COMING_SOON: Connector[] = [
  { name: "iCloud", slug: "icloud", category: "Accounts" },
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

/** How many placeholder tiles sit next to Upload and Google before the "+N more" tile. */
const FEATURED = 1;


/** Data-source connectors. Upload is live; the rest are placeholders for now. */
export function ConnectPanel({ onTwin }: { onTwin?: (twin: Twin | null) => void }) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [consent, setConsent] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
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
    setBusy(`Reading ${files.length} file${files.length > 1 ? "s" : ""} and updating your twin…`);
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
    setBusy(null);
  }

  async function connectGoogle(scopes: GoogleScope[]) {
    setConsent(false);
    setBusy("Syncing Google account and updating your twin…");
    setError(null);
    try {
      const res = await fetch("/api/connectors/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes }),
      }).then((r) => r.json());
      if (res.error) setError(res.error);
      else onTwin?.(res.twin ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
    await refresh();
    setBusy(null);
  }

  const googleSynced = sources.some((s) => s.connector === "google");

  async function disconnectGoogle() {
    setDisconnectOpen(false);
    setBusy(`Disconnecting ${GOOGLE.name} and updating your twin…`);
    setError(null);
    const res = await fetch("/api/sources?connector=google", { method: "DELETE" }).then((r) => r.json());
    if (res.error) setError(res.error);
    else onTwin?.(res.twin ?? null);
    await refresh();
    setBusy(null);
  }

  /** Google tile/row: connect if not synced, otherwise offer to disconnect. */
  function openGoogle() {
    if (googleSynced) setDisconnectOpen(true);
    else setConsent(true);
  }

  async function remove(id: string) {
    setBusy("Removing source and updating your twin…");
    const res = await fetch(`/api/sources?id=${id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.error) setError(res.error);
    else onTwin?.(res.twin ?? null);
    await refresh();
    setBusy(null);
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
          <p className="mt-3 text-center text-xs text-muted">Files stay with Formly.</p>
        </Modal>
      )}

      {consent && <GoogleConsent onAllow={connectGoogle} onCancel={() => setConsent(false)} />}

      {disconnectOpen && (
        <Modal title={`Disconnect ${GOOGLE.name}?`} onClose={() => setDisconnectOpen(false)}>
          <div className="flex items-start gap-3">
            <ConnectorLogo slug={GOOGLE.slug} className="mt-0.5 h-8 w-8 shrink-0" />
            <p className="text-sm text-muted">
              Formly will remove the data it synced from your {GOOGLE.name} account and rebuild your digital twin
              without it. You can reconnect any time.
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setDisconnectOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-bg"
            >
              Cancel
            </button>
            <button
              onClick={disconnectGoogle}
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
          <button
            onClick={openGoogle}
            disabled={!!busy}
            className={`${tile} ${googleSynced ? "border-brand bg-brand/5" : "border-transparent shadow-surface hover:shadow-surface-hover"}`}
          >
            <span className="relative">
              <ConnectorLogo slug={GOOGLE.slug} />
              {googleSynced && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand text-white ring-2 ring-white">
                  <CheckIcon className="h-2.5 w-2.5" />
                </span>
              )}
            </span>
            <span className="w-full truncate text-[11px] font-medium">{GOOGLE.name}</span>
          </button>
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
          <div className="max-h-[60vh] space-y-4 overflow-y-auto overscroll-contain pr-1">
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
            {[...new Set([GOOGLE, ...COMING_SOON].map((c) => c.category))].map((cat) => (
              <div key={cat}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{cat}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[GOOGLE, ...COMING_SOON]
                    .filter((c) => c.category === cat)
                    .map((c) =>
                      c === GOOGLE ? (
                        <button
                          key={c.name}
                          onClick={() => {
                            setMoreOpen(false);
                            openGoogle();
                          }}
                          disabled={!!busy}
                          className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm shadow-surface transition hover:shadow-surface-hover"
                        >
                          <ConnectorLogo slug={c.slug} className="h-5 w-5" />
                          <span className="flex-1 truncate font-medium">{c.name}</span>
                          {googleSynced && <span className="text-xs text-brand-dark">Synced</span>}
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
                      ),
                    )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {busy && (
        <div className="flex items-center gap-2 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand-dark">
          <Spinner /> {busy}
        </div>
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
                {c === "google" ? <ConnectorLogo slug={GOOGLE.slug} className="h-3 w-3" /> : <FileIcon />}
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
                    {s.connector === "google" ? <ConnectorLogo slug={GOOGLE.slug} className="h-3.5 w-3.5" /> : <FileIcon />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.connector === "google" ? `Synced from ${GOOGLE.name}` : "Uploaded"} on{" "}
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
    <svg viewBox="0 0 24 24" className="icon-line h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5" />
    </svg>
  );
}

function UploadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`icon-line ${className}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
    </svg>
  );
}

export function Spinner() {
  // Reduced motion swaps the spin for an opacity pulse.
  return (
    <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-pulse" />
  );
}
