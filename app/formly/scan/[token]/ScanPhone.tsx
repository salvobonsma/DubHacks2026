"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckIcon, CloseIcon, LockIcon, WarningIcon } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import type { ScanState } from "@/lib/scan";

const DOCS = [
  { name: "Driver's license, front", hint: "Name, date of birth, address" },
  { name: "Passport photo page", hint: "The page with your photo" },
  { name: "Pay stub", hint: "Your most recent one" },
  { name: "Utility bill", hint: "Shows your current address" },
];

interface Picked {
  id: number;
  file: File;
  /** Object URL for an image thumbnail; null for PDFs. */
  preview: string | null;
}

type Phase =
  | { kind: "pick" }
  | { kind: "sending"; pct: number }
  | { kind: "reading" }
  | { kind: "done"; files: number }
  | { kind: "closed"; message: string };

function initialPhase(state: ScanState, files: number): Phase {
  if (state === "received") return { kind: "done", files };
  if (state === "expired") return { kind: "closed", message: "This link expired. Scan a new code on your computer." };
  if (state === "receiving") return { kind: "closed", message: "This link is already being used by another phone." };
  if (state === "missing") return { kind: "closed", message: "This link isn't valid. Scan the code on your computer again." };
  return { kind: "pick" };
}

/** Phone photos are 3-12 MB; a 2400px JPEG is plenty to read an ID and uploads far faster over Wi-Fi. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.\w+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    // Formats the browser can't decode (some HEIC) go up as they are.
    return file;
  }
}

/** XHR rather than fetch: it's the only way to get real upload progress on a phone. */
function post(url: string, body: FormData, onProgress: (pct: number) => void) {
  return new Promise<{ ok: boolean; data: { error?: string; files?: number; errors?: string[] } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((100 * e.loaded) / e.total);
    xhr.onload = () => {
      try {
        resolve({ ok: xhr.status < 400, data: JSON.parse(xhr.responseText) });
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Lost connection to your computer. Check you're on the same Wi-Fi."));
    xhr.send(body);
  });
}

export function ScanPhone({
  token,
  state,
  files,
  error: initialError,
}: {
  token: string;
  state: ScanState;
  files: number;
  error: string | null;
}) {
  const [phase, setPhase] = useState<Phase>(() => initialPhase(state, files));
  const [picked, setPicked] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(initialError);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Until JS runs the form posts natively (see the route); after that we upload with progress.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const nextId = useRef(0);
  const previews = useRef<string[]>([]);
  const action = `/api/scan/${token}`;

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function add(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const added = Array.from(list).map((file) => {
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      if (preview) previews.current.push(preview);
      return { id: nextId.current++, file, preview };
    });
    setPicked((prev) => [...prev, ...added]);
  }

  function remove(id: number) {
    setPicked((prev) => prev.filter((p) => p.id !== id));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (picked.length === 0) return;
    setError(null);
    setPhase({ kind: "sending", pct: 0 });
    try {
      const body = new FormData();
      for (const f of await Promise.all(picked.map((p) => shrink(p.file)))) body.append("files", f);
      const res = await post(action, body, (pct) => setPhase(pct >= 100 ? { kind: "reading" } : { kind: "sending", pct }));
      if (!res.ok || res.data.error) {
        const message = res.data.error ?? "Something went wrong.";
        // A used or expired link can't take a retry; anything else keeps the photos so they can try again.
        if (/already used|expired/i.test(message)) setPhase({ kind: "closed", message });
        else {
          setError(message);
          setPhase({ kind: "pick" });
        }
        return;
      }
      setWarnings(res.data.errors ?? []);
      setPhase({ kind: "done", files: res.data.files ?? picked.length });
    } catch (err) {
      setError((err as Error).message);
      setPhase({ kind: "pick" });
    }
  }

  const count = picked.length;
  // "photo" while everything picked is a camera shot; a PDF or other file makes it "file".
  const noun = picked.every((p) => p.preview) ? "photo" : "file";
  const busy = phase.kind === "sending" || phase.kind === "reading";

  return (
    <div className="flex-1">
      <style>{`@keyframes formly-scan-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }`}</style>
      <header className="bg-navy">
        <div className="mx-auto flex max-w-md items-center px-4 py-3.5">
          <Logo light />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-6 pb-10">
        {phase.kind === "done" ? (
          <section className="rounded-2xl bg-white p-6 text-center shadow-surface">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-brand-dark">
              <CheckIcon className="h-7 w-7" stroke={2} />
            </span>
            <h1 className="text-xl">
              Sent {phase.files} {phase.files === 1 ? "document" : "documents"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              They&apos;re on your computer now. You can put your phone down and carry on there.
            </p>
            {warnings.length > 0 && (
              <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-amber-50 p-3 text-left text-xs text-amber-800">
                <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {warnings.join("; ")}
              </p>
            )}
          </section>
        ) : phase.kind === "closed" ? (
          <section className="rounded-2xl bg-white p-6 text-center shadow-surface">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg text-muted">
              <WarningIcon className="h-7 w-7" stroke={2} />
            </span>
            <h1 className="text-xl">Can&apos;t use this link</h1>
            <p className="mt-2 text-sm text-muted">{phase.message}</p>
          </section>
        ) : (
          <form method="post" encType="multipart/form-data" action={action} onSubmit={send} className="space-y-5">
            <div>
              <h1 className="text-2xl leading-tight">Add documents from your phone</h1>
              <p className="mt-1.5 text-sm text-muted">Photos go straight to Formly on your computer.</p>
            </div>

            <section className="rounded-2xl bg-white p-5 shadow-surface">
              <h2 className="mb-3 text-sm font-semibold">What to photograph</h2>
              <ul className="space-y-2.5">
                {DOCS.map((d) => (
                  <li key={d.name} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    <span>
                      <span className="font-medium">{d.name}</span>
                      <span className="text-muted"> · {d.hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                Lay it flat in good light with all four corners in the frame.
              </p>
            </section>

            {count > 0 && (
              <ul className="grid grid-cols-3 gap-2" aria-label="Photos to send">
                {picked.map((p) => (
                  <li key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-white">
                    {p.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local object URL, not an optimizable asset
                      <img src={p.preview} alt={p.file.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center p-2 text-center text-xs break-all text-muted">
                        {p.file.name}
                      </span>
                    )}
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        aria-label={`Remove ${p.file.name}`}
                        className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-navy/70 text-white"
                      >
                        <CloseIcon className="h-4 w-4" stroke={2} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p className="flex items-start gap-1.5 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
                <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            {busy ? (
              <div role="status" aria-live="polite">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-brand-dark">
                    {phase.kind === "sending"
                      ? `Sending ${count === 1 ? `your ${noun}` : `${count} ${noun}s`}…`
                      : `Reading ${count === 1 ? "your document" : "your documents"}…`}
                  </span>
                  {phase.kind === "sending" && <span className="text-xs tabular-nums text-muted">{Math.round(phase.pct)}%</span>}
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-brand/15">
                  {phase.kind === "sending" ? (
                    <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${phase.pct}%` }} />
                  ) : (
                    <div className="absolute inset-y-0 w-2/5 rounded-full bg-brand animate-[formly-scan-slide_1.2s_ease-in-out_infinite]" />
                  )}
                </div>
                {phase.kind === "reading" && (
                  <p className="mt-2 text-xs text-muted">Keep this page open. This takes up to a minute.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <label
                  className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-base font-semibold transition-colors ${
                    count > 0
                      ? "border border-line bg-white text-navy active:bg-bg"
                      : "bg-brand text-white active:bg-brand-dark"
                  }`}
                >
                  <CameraIcon />
                  {count > 0 ? "Take another photo" : "Take a photo"}
                  <input
                    type="file"
                    name="files"
                    accept="image/*,application/pdf"
                    capture="environment"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      add(e.target.files);
                      if (hydrated) e.target.value = "";
                    }}
                  />
                </label>
                {(count > 0 || !hydrated) && (
                  <button
                    type="submit"
                    className="flex h-14 w-full items-center justify-center rounded-full bg-brand text-base font-semibold text-white transition-colors active:bg-brand-dark"
                  >
                    {count > 0 ? `Send ${count} ${noun}${count === 1 ? "" : "s"} to Formly` : "Send to Formly"}
                  </button>
                )}
                <label className="block py-1 text-center text-sm font-medium text-brand-dark">
                  Choose a file or PDF instead
                  <input
                    type="file"
                    name="files"
                    accept="image/*,application/pdf"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      add(e.target.files);
                      if (hydrated) e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}

            <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <LockIcon className="h-2.5 w-2.5" stroke={1.25} /> Businesses only get the answers you approve.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}

const noop = () => () => {};

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="icon-line h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
