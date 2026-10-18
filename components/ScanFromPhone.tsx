"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, WarningIcon } from "./Icons";

type Status =
  | { kind: "loading" }
  | { kind: "waiting"; receiving: boolean }
  | { kind: "received"; files: number; twinError?: string }
  | { kind: "expired" }
  | { kind: "error"; message: string };

/**
 * Modal body for "Scan with phone": opens a single-use scan link, shows it as a QR code plus text,
 * and polls until the phone's photos are in sources and the twin is rebuilt.
 */
export function ScanFromPhone({
  onDone,
}: {
  /** Called once the phone's files are saved; twinError is set when the twin rebuild after them failed. */
  onDone: (result?: { files: number; twinError?: string }) => void;
}) {
  const [link, setLink] = useState<{ token: string; url: string; qr: string } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Latest callback without restarting the poll when the parent re-renders.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/scan", { method: "POST" }).then((r) => r.json());
        const qr = await QRCode.toDataURL(res.url, { margin: 1, width: 440, color: { dark: "#0f1a2a" } });
        if (cancelled) return;
        setLink({ token: res.token, url: res.url, qr });
        setStatus({ kind: "waiting", receiving: false });
      } catch (e) {
        if (!cancelled) setStatus({ kind: "error", message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!link) return;
    let stopped = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/${link.token}`);
        const data = await res.json();
        if (stopped) return;
        if (res.status === 410 || res.status === 404) {
          setStatus({ kind: "expired" });
          clearInterval(t);
        } else if (data.status === "received") {
          setStatus({ kind: "received", files: data.files, twinError: data.twinError });
          clearInterval(t);
          done.current({ files: data.files, twinError: data.twinError });
        } else {
          setStatus({ kind: "waiting", receiving: Boolean(data.receiving) });
        }
      } catch {
        // A missed poll (dev reload, Wi-Fi blip) is fine; the next one catches up.
      }
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [link]);

  const restart = useCallback(() => {
    setLink(null);
    setStatus({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked in popups; the URL is still selectable.
    }
  }

  if (status.kind === "received") {
    return (
      <div className="py-4 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand-dark">
          <CheckIcon className="h-5 w-5" stroke={2} />
        </span>
        <div className="font-semibold">
          Got {status.files} {status.files === 1 ? "document" : "documents"} from your phone
        </div>
        <p className="mt-1 text-sm text-muted">
          {status.twinError
            ? "They're in your sources, but your digital twin couldn't be updated yet."
            : "They're in your sources and your digital twin is up to date."}
        </p>
      </div>
    );
  }

  if (status.kind === "expired" || status.kind === "error") {
    return (
      <div className="py-4 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-bg text-muted">
          <WarningIcon className="h-5 w-5" stroke={2} />
        </span>
        <div className="font-semibold">{status.kind === "expired" ? "This code expired" : "Couldn't make a code"}</div>
        {status.kind === "error" && <p className="mt-1 text-sm text-muted">{status.message}</p>}
        <button
          onClick={restart}
          className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
        >
          Make a new code
        </button>
      </div>
    );
  }

  const local = link ? /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(link.url) : false;
  const lan = link ? /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(link.url) : false;

  return (
    <div>
      <p className="text-sm text-muted">
        Point your phone&apos;s camera at the code, then photograph your driver&apos;s license, passport, pay stub or
        utility bill.
      </p>
      <div className="mx-auto my-4 flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-line bg-white p-2">
        {link ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL
          <img src={link.qr} alt="QR code that opens the scan page on your phone" className="h-full w-full" />
        ) : (
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/25 border-t-brand" aria-label="Loading" />
        )}
      </div>
      {link && (
        <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-xs select-all">{link.url}</code>
          <button onClick={copy} className="shrink-0 text-xs font-medium text-brand-dark hover:underline">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <p className="mt-3 flex items-center justify-center gap-2 text-sm" role="status" aria-live="polite">
        {status.kind === "waiting" && status.receiving ? (
          <span className="font-medium text-brand-dark">Your phone is sending. Reading your documents…</span>
        ) : (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden />
            <span className="text-muted">Waiting for your phone</span>
          </>
        )}
      </p>
      <p className="mt-2 text-center text-xs text-muted">
        {local
          ? "Your phone can't open a localhost link. Open Formly from this computer's network address instead."
          : `${lan ? "Your phone needs to be on the same Wi-Fi. " : ""}The code works once and expires in 15 minutes.`}
      </p>
    </div>
  );
}
