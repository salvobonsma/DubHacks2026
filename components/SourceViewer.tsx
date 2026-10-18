"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Source } from "@/lib/types";
import { ConnectorLogo } from "./ConnectorLogo";
import type { TwinFact } from "./Markdown";

type SourceMeta = Omit<Source, "text">;

/** Popup showing the documents a twin fact came from, with the matching text highlighted. */
export function SourceViewer({ fact, onClose }: { fact: TwinFact; onClose: () => void }) {
  const [all, setAll] = useState<SourceMeta[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [doc, setDoc] = useState<Source | null>(null);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then(setAll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The twin cites sources by (sometimes shortened) name, e.g. "Google Account".
  const matched = useMemo(() => {
    if (!all) return [];
    const cited = fact.sources.toLowerCase();
    return all.filter((s) => {
      const name = s.name.toLowerCase();
      return cited.includes(name) || cited.includes(name.replace(/\s*\(.*\)$/, ""));
    });
  }, [all, fact.sources]);

  const activeId = active ?? matched[0]?.id ?? null;

  useEffect(() => {
    if (!activeId) return;
    let live = true;
    fetch(`/api/sources?id=${activeId}`)
      .then((r) => r.json())
      .then((d) => live && setDoc(d));
    return () => {
      live = false;
    };
  }, [activeId]);

  const current = doc?.id === activeId ? doc : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-dark">{fact.label || "Source"}</p>
            <p className="mt-0.5 font-semibold">{fact.value.replace(/\*\*/g, "")}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-muted hover:text-navy">
            ×
          </button>
        </div>

        {all && matched.length === 0 ? (
          <p className="p-5 text-sm text-muted">Couldn&apos;t find the original document for this fact.</p>
        ) : (
          <>
            {matched.length > 1 && (
              <div className="flex gap-1 overflow-x-auto border-b border-line px-5 pt-3">
                {matched.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`shrink-0 rounded-t-lg border-b-2 px-3 pb-2 text-sm transition ${
                      s.id === activeId ? "border-brand font-semibold" : "border-transparent text-muted hover:text-navy"
                    }`}
                  >
                    {displayName(s)}
                  </button>
                ))}
              </div>
            )}
            {current ? (
              <>
                <Path source={current} />
                <Document text={current.text} value={fact.value} />
              </>
            ) : (
              <p className="p-5 text-sm text-muted">Loading…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function displayName(s: SourceMeta) {
  return s.name.split(": ").pop()!.replace(/\s*\(.*\)$/, "");
}

function Path({ source }: { source: Source }) {
  const parts =
    source.connector === "upload" ? ["Formly", "Uploads", source.name] : ["Google", ...source.name.split(": ")];
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-5 pt-4 text-xs text-muted">
      {source.connector === "google" ? (
        <ConnectorLogo slug="googledrive" className="h-3.5 w-3.5" />
      ) : (
        <FolderIcon />
      )}
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-line">/</span>}
          <span className={i === parts.length - 1 ? "font-medium text-navy" : ""}>{p}</span>
        </Fragment>
      ))}
      <span className="ml-auto">Added {new Date(source.created_at).toLocaleDateString()}</span>
    </div>
  );
}

function Document({ text, value }: { text: string; value: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const ranges = useMemo(() => findMatches(text, value), [text, value]);

  useEffect(() => {
    ref.current?.querySelector("mark")?.scrollIntoView({ block: "center" });
  }, [ranges]);

  const pieces: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) pieces.push(text.slice(at, a));
    pieces.push(
      <mark key={i} className="rounded bg-brand/30 px-0.5 text-navy">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  pieces.push(text.slice(at));

  return (
    <pre
      ref={ref}
      className="m-5 mt-3 flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-bg p-4 font-mono text-[12.5px] leading-relaxed"
    >
      {pieces}
    </pre>
  );
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Loose matching so "206-555-0147" finds "(206) 555-0147" and "April 12, 1999" finds "04/12/1999". */
function findMatches(text: string, value: string): [number, number][] {
  const clean = value.replace(/\*\*/g, "");
  const parts = [clean, clean.replace(/\s*\(.*\)\s*/g, " "), ...clean.split(/[,()]|:\s/)]
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  const patterns: RegExp[] = [];
  for (const p of parts) {
    patterns.push(...variants(p));
  }

  let ranges = collect(text, patterns);
  if (ranges.length === 0) {
    // Fall back to individual words, e.g. "Alexander Wei Chen" vs "2 ALEXANDER WEI / 1 CHEN".
    const words = clean.match(/[A-Za-z0-9*$'-]{3,}/g) ?? [];
    ranges = collect(
      text,
      words.filter((w) => !/^(the|and|for|goes|since)$/i.test(w)).map((w) => new RegExp(`\\b${esc(w)}\\b`, "gi")),
    );
  }
  return ranges;
}

function variants(p: string): RegExp[] {
  const out = [new RegExp(esc(p).replace(/\s+/g, "[\\s,]+"), "gi")];
  const digits = p.replace(/\D/g, "");
  if (digits.length >= 4 && digits.length >= p.replace(/\s/g, "").length * 0.5) {
    out.push(new RegExp(digits.split("").join("\\D{0,3}"), "g"));
  }
  const d = p.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (d) {
    const m = String(MONTHS.indexOf(d[1].toLowerCase()) + 1).padStart(2, "0");
    const day = d[2].padStart(2, "0");
    out.push(new RegExp(`${m}/${day}/${d[3]}|${d[3]}-${m}-${day}`, "g"));
  }
  return out;
}

function collect(text: string, patterns: RegExp[]): [number, number][] {
  const found: [number, number][] = [];
  for (const re of patterns) for (const m of text.matchAll(re)) if (m[0]) found.push([m.index!, m.index! + m[0].length]);
  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
