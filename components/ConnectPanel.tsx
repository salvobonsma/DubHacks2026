"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectBank } from "./ConnectBank";
import { ConnectorLogo } from "./ConnectorLogo";
import { ProgressStatus } from "./ProgressStatus";
import { ScanFromPhone } from "./ScanFromPhone";
import { ArrowRightIcon, CheckIcon, CloseIcon, LockIcon } from "./Icons";
import type { Twin } from "@/lib/types";

export interface SourceRow {
  id: string;
  connector: string;
  name: string;
  chars: number;
  created_at: number;
}

/** GET /api/connectors/status. */
export interface ConnectorStatus {
  google: {
    mode: "live" | "off";
    access: "full" | "picker";
    /** Picker mode with GOOGLE_API_KEY + GOOGLE_APP_ID set. */
    picker: boolean;
    connected: boolean;
    email?: string;
    /** Picker mode: address, phone and birthday granted. */
    details?: boolean;
  };
  microsoft: { mode: "live" | "off"; connected: boolean; email?: string };
  scan: { lanUrl: string | null };
  ttl: { minutes: number; label: string };
}

type Account = "google" | "microsoft";

const NAMES: Record<string, string> = {
  google: "Google",
  microsoft: "Microsoft",
  plaid: "Bank",
  scan: "Phone scan",
  sample: "Sample data",
};
const SYNC_SCOPES: Record<Account, string[]> = {
  google: ["profile", "contacts", "gmail", "drive"],
  microsoft: ["profile", "onedrive", "outlook"],
};

/**
 * Data-source connectors, all real: Google (only when OAuth is set up; hidden otherwise), the bank (Plaid, only
 * when set up), a camera shot of an ID on phones, file upload, scan-with-phone on desktop, and Microsoft when
 * configured. Sample personas are not offered here (only on /demo).
 * onAdded fires after a source is added and the twin rebuilt, so the fill popup can go straight to the fill.
 * layout "list" is the popup's phone-first screen: one full-width row per way in, in the order the demo uses
 * (Continue with Google, Connect your bank, Photograph your ID, Upload a file). "tiles" is the /formly grid.
 */
export function ConnectPanel({
  onTwin,
  onSources,
  onAdded,
  layout = "tiles",
}: {
  onTwin?: (twin: Twin | null) => void;
  /** Called whenever the source list reloads, so the parent can tell "no sources" from "twin not built". */
  onSources?: (sources: SourceRow[]) => void;
  onAdded?: (twin: Twin) => void;
  layout?: "tiles" | "list";
}) {
  const [sources, setSourcesState] = useState<SourceRow[]>([]);
  /** Sources are saved but there is no twin (its rebuild failed, or a removal dropped the stale one). */
  const [twinMissing, setTwinMissing] = useState(false);
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  /** Picker mode: the "Continue with Google" sheet with the optional address/phone/birthday box. */
  const [googleStart, setGoogleStart] = useState(false);
  const [wantDetails, setWantDetails] = useState(false);
  /** Which account's manage sheet is open: re-sync / pick files / disconnect. */
  const [manage, setManage] = useState<Account | null>(null);
  /** A touch phone: the ID tile opens the camera, and scan-with-phone (a QR code) makes no sense. */
  const [phone, setPhone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Read once after mount (no matchMedia during server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhone(window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 820px)").matches);
  }, []);

  const setSources = useCallback(
    (s: SourceRow[]) => {
      const list = Array.isArray(s) ? s : [];
      setSourcesState(list);
      onSources?.(list);
    },
    [onSources],
  );

  const gotTwin = useCallback(
    (twin: Twin | null) => {
      setTwinMissing(!twin);
      onTwin?.(twin);
    },
    [onTwin],
  );

  const refresh = useCallback(async () => {
    const [s, st] = await Promise.all([
      fetch("/api/sources").then((r) => r.json()),
      fetch("/api/connectors/status").then((r) => r.json()),
    ]);
    setSources(s);
    setStatus(st);
  }, [setSources]);

  /** For work that finished elsewhere (phone scan) or failed halfway: reload the twin the server has now. */
  const refreshTwin = useCallback(async () => {
    const d = await fetch("/api/twin").then((r) => r.json());
    gotTwin(d.twin ?? null);
    return (d.twin ?? null) as Twin | null;
  }, [gotTwin]);

  // On mount: load sources + status + whether a twin exists. Back from an OAuth redirect (?connected= /
  // ?connect_error=), show the result once and drop the params so a reload doesn't repeat it. The callback
  // only saves tokens (?syncing=1), so the import runs here, under the progress label.
  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected");
    const failed = url.searchParams.get("connect_error");
    const syncing = url.searchParams.get("syncing") === "1" && (connected === "google" || connected === "microsoft");
    if (connected || failed) {
      url.searchParams.delete("connected");
      url.searchParams.delete("connect_error");
      url.searchParams.delete("syncing");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
    Promise.all([
      fetch("/api/sources").then((r) => r.json()),
      fetch("/api/connectors/status").then((r) => r.json()),
      fetch("/api/twin").then((r) => r.json()),
    ]).then(async ([s, st, t]: [SourceRow[], ConnectorStatus, { twin: Twin | null }]) => {
      setSources(s);
      setStatus(st);
      setTwinMissing(!t.twin);
      if (failed) setError(failed);
      if (!syncing) {
        if (connected) setNotice(`${NAMES[connected] ?? "Account"} connected.`);
        // Back from an OAuth bank (/formly/plaid-oauth already imported it): straight on to the fill.
        if (connected === "plaid" && t.twin) onAdded?.(t.twin);
        return;
      }
      // Picker mode imports only the profile; the files come from the Picker, opened right after.
      const picker = connected === "google" && st.google.access === "picker";
      const twin = await sync(connected as Account, `${NAMES[connected!]} connected. Your data is synced.`, !picker);
      if (picker && st.google.picker) openPicker(twin);
    });
    // Once on mount; the callbacks change identity with the parent's handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * POST/DELETE that returns {twin}; shared by upload, connect, re-sync, disconnect, remove and rebuild.
   * On an error the server may still have changed (sources saved, stale twin dropped), so the twin is
   * reloaded rather than left as it was. added: this added data, so tell the parent (onAdded) when it worked.
   */
  async function run(label: string, req: () => Promise<Response>, done?: string, added = false): Promise<Twin | null> {
    setBusy(label);
    setError(null);
    setNotice(null);
    let twin: Twin | null = null;
    try {
      const res = await req().then((r) => r.json());
      if (res.errors?.length) setError(res.errors.join("; "));
      if (res.error) {
        setError(res.error);
        twin = await refreshTwin().catch(() => null);
      } else {
        twin = res.twin ?? null;
        gotTwin(twin);
        if (done) setNotice(done);
        if (added && twin) onAdded?.(twin);
      }
    } catch (e) {
      setError((e as Error).message);
      twin = await refreshTwin().catch(() => null);
    }
    await refresh();
    setBusy(null);
    return twin;
  }

  /** Build the twin from the sources already saved, after a rebuild failed. */
  function rebuild() {
    run("Building your digital twin…", () => fetch("/api/twin", { method: "POST" }), "Your digital twin is built.", true);
  }

  function upload(files: FileList | File[]) {
    if (!files.length) return;
    const body = new FormData();
    for (const f of files) body.append("files", f);
    run(
      files.length > 1 ? `Reading ${files.length} files…` : `Reading ${files[0].name}…`,
      () => fetch("/api/sources", { method: "POST", body }),
      undefined,
      true,
    );
  }

  function sync(account: Account, done?: string, added = true) {
    return run(
      account === "google" ? "Reading your Google account…" : `Reading your ${NAMES[account]} account…`,
      () =>
        fetch(`/api/connectors/${account}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopes: SYNC_SCOPES[account] }),
        }),
      done,
      added,
    );
  }

  function resync(account: Account) {
    setManage(null);
    sync(account);
  }

  function disconnect(account: Account) {
    setManage(null);
    run(`Disconnecting ${NAMES[account]}…`, () => fetch(`/api/connectors/${account}`, { method: "DELETE" }));
  }

  function remove(id: string) {
    run("Removing the source…", () => fetch(`/api/sources?id=${id}`, { method: "DELETE" }));
  }

  /** Live and not connected: hand off to the provider's consent screen, coming back to this page. */
  function signIn(account: Account, opts: { details?: boolean } = {}) {
    const returnTo = window.location.pathname + window.location.search;
    // A full navigation, not router.push: the start route 302s off-site to the consent screen.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/connectors/${account}/start?returnTo=${encodeURIComponent(returnTo)}${opts.details ? "&details=1" : ""}`;
  }

  /**
   * Picker mode: the Google Picker, so the user chooses which Drive files Formly may read (drive.file).
   * `fallback` is the twin to hand on (onAdded) if they close the Picker without choosing anything.
   */
  async function openPicker(fallback: Twin | null = null) {
    setManage(null);
    setError(null);
    try {
      const cfg = (await fetch("/api/connectors/google/picker").then((r) => r.json())) as PickerConfig & { error?: string };
      if (cfg.error) throw new Error(cfg.error);
      const picked = await showPicker(cfg);
      if (picked.length === 0) {
        if (fallback) onAdded?.(fallback);
        return;
      }
      await run(
        picked.length > 1 ? `Reading ${picked.length} files from Drive…` : "Reading your file from Drive…",
        () =>
          fetch("/api/connectors/google/picker", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileIds: picked }),
          }),
        undefined,
        true,
      );
    } catch (e) {
      setError(`Couldn't open Google Drive: ${(e as Error).message}`);
      if (fallback) onAdded?.(fallback);
    }
  }

  const googleLive = status?.google.mode === "live";
  const googleConnected = googleLive && !!status?.google.connected;
  const pickerMode = status?.google.access === "picker";
  const msLive = status?.microsoft.mode === "live";
  const msConnected = !!status?.microsoft.connected;

  function openGoogle() {
    if (googleConnected) setManage("google");
    else if (pickerMode) setGoogleStart(true);
    else signIn("google");
  }

  function openMicrosoft() {
    if (msConnected) setManage("microsoft");
    else signIn("microsoft");
  }

  /** The bank finished importing (or was disconnected): same bookkeeping as any other source. */
  async function bankChanged(twin: Twin | null, added: boolean) {
    gotTwin(twin);
    await refresh();
    if (added && twin) onAdded?.(twin);
  }

  const tile = "relative flex flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-3 transition";
  const idle = "border-transparent shadow-surface hover:shadow-surface-hover";
  const on = "border-brand bg-brand/5";
  const manageEmail = manage && status?.[manage].email;
  const tiles = 2 + (googleLive ? 1 : 0) + (msLive ? 1 : 0);

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
            <div className="mt-1 text-xs text-muted">
              Driver&apos;s license or passport photo, pay stub, utility bill, resume, contact card (.vcf)
            </div>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.docx,.txt,.md,.csv,.json,.vcf,.eml"
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

      {/* Phones: straight to the back camera for the front of a driver's license (or a passport page). */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />

      {scanOpen && (
        <Modal title="Scan with phone" onClose={() => setScanOpen(false)}>
          <ScanFromPhone
            onDone={async (result) => {
              setScanOpen(false);
              // The files are saved either way; only claim the twin updated when the rebuild worked.
              if (result?.twinError) setError(`Got your scan, but the twin wasn't updated. ${result.twinError}`);
              else setNotice("Got your scan. Your digital twin is updated.");
              refresh();
              const twin = await refreshTwin().catch(() => null);
              if (twin && !result?.twinError) onAdded?.(twin);
            }}
          />
        </Modal>
      )}

      {googleStart && (
        <Modal title="Continue with Google" onClose={() => setGoogleStart(false)}>
          <p className="text-sm text-muted">
            You&apos;ll sign in with Google and pick the documents Formly may read: a license or passport scan, a pay
            stub, your resume. Formly gets your name and email from your Google account.
          </p>
          <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-line px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={wantDetails}
              onChange={(e) => setWantDetails(e.target.checked)}
              className="mt-0.5 accent-brand"
            />
            <span>
              Also add my address, phone and birthday
              <span className="block text-xs text-muted">Google will show an unverified-app warning</span>
            </span>
          </label>
          <div className="mt-5 flex justify-end">
            <button
              onClick={() => signIn("google", { details: wantDetails })}
              className="rounded-full bg-navy px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              Continue
            </button>
          </div>
        </Modal>
      )}

      {manage && (
        <Modal title={NAMES[manage]} onClose={() => setManage(null)}>
          <div className="flex items-start gap-3">
            <AccountLogo account={manage} className="mt-0.5 h-8 w-8 shrink-0" />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{manageEmail || NAMES[manage]}</p>
              <p className="mt-1 text-muted">
                Disconnecting removes the data Formly read from this account, revokes Formly&apos;s access and
                rebuilds your digital twin without it.
              </p>
            </div>
          </div>
          {manage === "google" && pickerMode && (
            <div className="mt-4 space-y-2">
              {status?.google.picker && (
                <button
                  onClick={() => openPicker()}
                  className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-left text-sm font-medium transition hover:border-brand"
                >
                  Pick files from Google Drive <ArrowRightIcon />
                </button>
              )}
              {!status?.google.details && (
                <button
                  onClick={() => signIn("google", { details: true })}
                  className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-left text-sm transition hover:border-brand"
                >
                  <span>
                    <span className="block font-medium">Add my address, phone and birthday</span>
                    <span className="block text-xs text-muted">Google will show an unverified-app warning</span>
                  </span>
                  <ArrowRightIcon />
                </button>
              )}
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => resync(manage)}
              className="rounded-full px-4 py-2 text-sm font-medium text-navy transition-colors hover:bg-bg"
            >
              Re-sync
            </button>
            <button
              onClick={() => disconnect(manage)}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Disconnect
            </button>
          </div>
        </Modal>
      )}

      {layout === "list" ? (
        <div>
          <p className="mb-2 text-sm font-semibold">Add your info</p>
          <div className="space-y-2">
            {googleLive && (
              <Row
                onClick={openGoogle}
                disabled={!!busy}
                on={googleConnected}
                icon={<ConnectorLogo slug="google" className="h-6 w-6" />}
                title={googleConnected ? (status?.google.email ?? "Google connected") : "Continue with Google"}
                detail={googleConnected ? "Connected. Tap to re-sync or disconnect" : "Your Gmail, Drive and Google profile"}
              />
            )}
            <ConnectBank onConnected={(twin) => bankChanged(twin, true)} onDisconnected={(twin) => bankChanged(twin, false)} />
            {phone ? (
              <Row
                onClick={() => camera.current?.click()}
                disabled={!!busy}
                icon={<CameraIcon className="h-5 w-5" />}
                title="Photograph your ID"
                detail="The front of your driver's license, or your passport photo page"
              />
            ) : (
              <Row
                onClick={() => setScanOpen(true)}
                disabled={!!busy}
                icon={<PhoneIcon className="h-5 w-5" />}
                title="Scan with your phone"
                detail="Photograph your ID or a document with your phone's camera"
              />
            )}
            <Row
              onClick={() => setUploadOpen(true)}
              disabled={!!busy}
              icon={<UploadIcon className="h-5 w-5" />}
              title="Upload a file"
              detail="A PDF, photo or resume from your files"
            />
            {msLive && (
              <Row
                onClick={openMicrosoft}
                disabled={!!busy}
                on={msConnected}
                icon={<MicrosoftLogo />}
                title={msConnected ? (status?.microsoft.email ?? "Microsoft connected") : "Continue with Microsoft"}
                detail={msConnected ? "Connected. Tap to re-sync or disconnect" : "Your Outlook mail and OneDrive"}
              />
            )}
          </div>
          {googleLive && !googleConnected && !pickerMode && (
            <p className="mt-2 text-xs text-muted">Google will say Formly isn&apos;t verified yet. Tap Advanced, then Continue.</p>
          )}
        </div>
      ) : (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Add a source</p>
        <div className={`grid gap-2 ${tiles === 4 ? "grid-cols-2 sm:grid-cols-4" : tiles === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {googleLive && (
            <button
              onClick={openGoogle}
              disabled={!!busy}
              title={status?.google.email}
              className={`${tile} ${googleConnected ? on : idle}`}
            >
              <span className="relative">
                <ConnectorLogo slug="google" />
                {googleConnected && <Connected />}
              </span>
              <span className="w-full truncate px-1 text-[11px] font-medium">
                {status?.google.email ?? "Continue with Google"}
              </span>
            </button>
          )}
          {phone ? (
            <button onClick={() => camera.current?.click()} disabled={!!busy} className={`${tile} ${idle}`}>
              <span className="flex h-6 w-6 items-center justify-center text-navy">
                <CameraIcon className="h-5 w-5" />
              </span>
              <span className="w-full truncate px-1 text-[11px] font-medium">Photograph your ID</span>
            </button>
          ) : (
            <button onClick={() => setScanOpen(true)} disabled={!!busy} className={`${tile} ${idle}`}>
              <span className="flex h-6 w-6 items-center justify-center text-navy">
                <PhoneIcon className="h-5 w-5" />
              </span>
              <span className="w-full truncate text-[11px] font-medium">Scan with phone</span>
            </button>
          )}
          <button onClick={() => setUploadOpen(true)} disabled={!!busy} className={`${tile} ${idle}`}>
            <span className="flex h-6 w-6 items-center justify-center text-navy">
              <UploadIcon className="h-5 w-5" />
            </span>
            <span className="w-full truncate text-[11px] font-medium">Upload a file</span>
          </button>
          {msLive && (
            <button
              onClick={openMicrosoft}
              disabled={!!busy}
              title={status?.microsoft.email}
              className={`${tile} ${msConnected ? on : idle}`}
            >
              <span className="relative">
                <MicrosoftLogo />
                {msConnected && <Connected />}
              </span>
              <span className="w-full truncate px-1 text-[11px] font-medium">
                {status?.microsoft.email ?? "Microsoft"}
              </span>
            </button>
          )}
        </div>
        {googleLive && !googleConnected && !pickerMode && (
          <p className="mt-2 text-xs text-muted">
            Google will say Formly isn&apos;t verified yet. Tap Advanced, then Continue.
          </p>
        )}
        {msLive && !msConnected && (
          <p className="mt-2 text-xs text-muted">Some work or school Microsoft accounts block third-party apps.</p>
        )}
        <ConnectBank
          className="mt-2"
          onConnected={(twin) => bankChanged(twin, true)}
          onDisconnected={(twin) => bankChanged(twin, false)}
        />
      </div>
      )}

      {busy && <ProgressStatus label={busy} className="rounded-lg bg-brand/10 px-3 py-2.5" />}
      {notice && !busy && (
        <div className="flex items-center gap-2 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand-dark">
          <CheckIcon className="h-3.5 w-3.5 shrink-0" /> {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          {/twin/i.test(error) && sources.length > 0 && !twinMissing && !busy && (
            <button onClick={rebuild} className="ml-1 font-semibold underline">
              Try again
            </button>
          )}
        </div>
      )}
      {twinMissing && sources.length > 0 && !busy && (
        <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">Your sources are saved but your twin isn&apos;t built yet.</span>
          <button
            onClick={rebuild}
            className="shrink-0 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black"
          >
            Build my twin
          </button>
        </div>
      )}

      {sources.length > 0 && (
        <button
          onClick={() => setSourcesOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm shadow-surface transition hover:shadow-surface-hover"
        >
          <span className="flex -space-x-1.5">
            {[...new Set(sources.map((s) => s.connector))].map((c) => (
              <span
                key={c}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-bg"
              >
                <SourceIcon connector={c} className="h-3 w-3" />
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
                    <SourceIcon connector={s.connector} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.connector === "scan"
                        ? "Scanned with phone"
                        : s.connector === "sample"
                          ? "Sample data for testing"
                          : NAMES[s.connector]
                            ? `Synced from ${NAMES[s.connector]}`
                            : "Uploaded"}{" "}
                      on {new Date(s.created_at).toLocaleDateString()}
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

interface PickerConfig {
  apiKey: string;
  appId: string;
  token: string;
}

/** The slice of the Google Picker API (apis.google.com/js/api.js) used here. */
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setCallback(cb: (data: { action: string; docs?: { id: string }[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}
interface PickerApi {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => { setIncludeFolders(v: boolean): unknown };
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}
type PickerWindow = Window & { gapi?: { load(lib: string, cb: () => void): void }; google?: { picker?: PickerApi } };

/** Load the Picker script once, open it, and resolve with the chosen file ids ([] if cancelled). */
async function showPicker(cfg: PickerConfig): Promise<string[]> {
  const w = window as PickerWindow;
  if (!w.google?.picker) {
    if (!w.gapi) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://apis.google.com/js/api.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("couldn't load the Google Picker"));
        document.head.appendChild(s);
      });
    }
    await new Promise<void>((resolve) => w.gapi!.load("picker", resolve));
  }
  const picker = w.google!.picker!;
  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .addView(new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(false))
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setTitle("Pick your ID scan, pay stub or resume")
      .setOAuthToken(cfg.token)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((d) => d.id));
        else if (data.action === picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}

/** One full-width way in on the popup's list screen: 56px tall, icon, title and one line of detail. */
function Row({
  onClick,
  disabled,
  on = false,
  icon,
  title,
  detail,
}: {
  onClick: () => void;
  disabled: boolean;
  on?: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition disabled:opacity-60 ${
        on ? "border-brand bg-brand/5" : "border-transparent bg-white shadow-surface hover:shadow-surface-hover"
      }`}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center text-navy">
        {icon}
        {on && <Connected />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted" />
    </button>
  );
}

/** Small check badge on a connected tile. */
function Connected() {
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand text-white ring-2 ring-white">
      <CheckIcon className="h-2.5 w-2.5" />
    </span>
  );
}

function AccountLogo({ account, className }: { account: Account; className?: string }) {
  return account === "google" ? (
    <ConnectorLogo slug="google" className={className} />
  ) : (
    <MicrosoftLogo className={className} />
  );
}

function SourceIcon({ connector, className }: { connector: string; className: string }) {
  if (connector === "google") return <ConnectorLogo slug="google" className={className} />;
  if (connector === "microsoft") return <MicrosoftLogo className={className} />;
  if (connector === "scan") return <PhoneIcon className={`${className} text-muted`} />;
  if (connector === "plaid") return <BankIcon className={`${className} text-muted`} />;
  if (connector === "sample") return <FileIcon />;
  return <FileIcon />;
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
      <div
        className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-2xl bg-white p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
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
    <svg
      viewBox="0 0 24 24"
      className="icon-line h-3.5 w-3.5 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinejoin="round"
    >
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5" />
    </svg>
  );
}

/** Microsoft's four squares (Simple Icons no longer carries Microsoft marks). */
function MicrosoftLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 23 23" className={className} aria-hidden>
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

function PhoneIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon-line ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

function BankIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon-line ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9.5 12 4l9 5.5M5 10v8M9.67 10v8M14.33 10v8M19 10v8M3 20h18" />
    </svg>
  );
}

function CameraIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon-line ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  );
}

function UploadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon-line ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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
