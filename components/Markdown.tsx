"use client";

import { Fragment, useState } from "react";

/** A twin bullet the user clicked: its label, value, and the raw "source: …" list. */
export interface TwinFact {
  label: string;
  value: string;
  sources: string;
}

const SOURCE_RE = /\s*_\(source:\s*([^)]*(?:\([^)]*\)[^)]*)*)\)_\s*$/i;

/**
 * Tiny renderer for the twin's markdown (headings, bullets, **bold**, _italic_).
 * Trailing "_(source: …)_" notes are hidden; bullets that had one become clickable via onFact.
 */
export function Markdown({
  text,
  secrets = [],
  onFact,
}: {
  text: string;
  /** Sensitive values (SSN, card number, …) shown masked until revealed. */
  secrets?: string[];
  onFact?: (fact: TwinFact) => void;
}) {
  const inline = (s: string) => renderInline(s, secrets);
  return (
    <div className="space-y-0.5 text-[14px] leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ") || line.startsWith("# "))
          return (
            <h3 key={i} className="pt-3 pb-0.5 text-xs font-bold uppercase tracking-wider text-brand-dark">
              {line.replace(/^#+\s*/, "")}
            </h3>
          );
        if (/^\s*[-*]\s/.test(line)) {
          const body = line.replace(/^\s*[-*]\s/, "");
          const source = body.match(SOURCE_RE);
          const content = source ? body.slice(0, source.index) : body;
          if (source && onFact) {
            const m = content.match(/^\*\*([^*]+?):?\*\*:?\s*(.*)$/);
            return (
              <button
                key={i}
                onClick={() =>
                  onFact({
                    label: m ? m[1].replace(/:$/, "") : "",
                    value: m ? m[2] : content.replace(/\*\*/g, ""),
                    sources: source[1],
                  })
                }
                className="-mx-2 flex w-[calc(100%+1rem)] gap-2 rounded-lg px-2 py-0.5 pl-3 text-left transition hover:bg-brand/10"
              >
                <span className="text-brand">•</span>
                <span>{inline(content)}</span>
              </button>
            );
          }
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-brand">•</span>
              <span>{inline(content)}</span>
            </div>
          );
        }
        if (!line.trim()) return null;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(s: string, secrets: string[]) {
  return s.split(/(\*\*[^*]+\*\*|_\([^)]*\)_|_[^_]+_)/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_"))
      return (
        <em key={i} className="text-xs not-italic text-muted">
          {part.slice(1, -1)}
        </em>
      );
    return <Fragment key={i}>{maskSecrets(part, secrets)}</Fragment>;
  });
}

function maskSecrets(s: string, secrets: string[]) {
  const found = secrets.filter((v) => v.length >= 3 && s.includes(v));
  if (!found.length) return s;
  const re = new RegExp(`(${found.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);
  return s.split(re).map((part, i) => (found.includes(part) ? <Secret key={i} value={part} /> : part));
}

function Secret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={shown ? "" : "tracking-widest"}>{shown ? value : "•".repeat(Math.min(value.length, 10))}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setShown(!shown);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setShown(!shown);
          }
        }}
        className="cursor-pointer text-xs font-medium text-brand-dark hover:underline"
      >
        {shown ? "Hide" : "Show"}
      </span>
    </span>
  );
}
