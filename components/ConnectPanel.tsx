"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Twin } from "@/lib/types";

interface SourceRow {
  id: string;
  connector: string;
  name: string;
  chars: number;
  created_at: number;
}

const COMING_SOON = [
  { name: "Google", icon: "G", color: "#4285F4" },
  { name: "OneDrive", icon: "☁", color: "#0078D4" },
  { name: "Gmail", icon: "✉", color: "#EA4335" },
  { name: "Apple Wallet", icon: "▣", color: "#111827" },
];

/** Data-source connectors. Upload is live; the rest are placeholders for now. */
export function ConnectPanel({ onTwin }: { onTwin?: (twin: Twin | null) => void }) {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setSources(await fetch("/api/sources").then((r) => r.json()));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  async function remove(id: string) {
    setBusy("Removing source and updating your twin…");
    const res = await fetch(`/api/sources?id=${id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.error) setError(res.error);
    else onTwin?.(res.twin ?? null);
    await refresh();
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
          drag ? "border-brand bg-brand/10" : "border-line hover:border-brand"
        }`}
      >
        <div className="text-sm font-semibold">Drop files or click to upload</div>
        <div className="mt-1 text-xs text-muted">PDF, images, DOCX, TXT, CSV, JSON</div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.docx,.txt,.md,.csv,.json"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {COMING_SOON.map((c) => (
          <div
            key={c.name}
            title="Coming soon"
            className="flex flex-col items-center gap-1 rounded-lg border border-line p-2 opacity-50"
          >
            <span className="text-lg font-bold" style={{ color: c.color }}>
              {c.icon}
            </span>
            <span className="text-[11px]">{c.name}</span>
          </div>
        ))}
      </div>

      {busy && (
        <div className="flex items-center gap-2 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand-dark">
          <Spinner /> {busy}
        </div>
      )}
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {sources.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                {s.connector}
              </span>
              <span className="flex-1 truncate">{s.name}</span>
              <button
                onClick={() => remove(s.id)}
                disabled={!!busy}
                className="text-xs text-muted hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
