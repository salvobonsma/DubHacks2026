"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { FactAction, FactOverride } from "@/lib/types";

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
const CENSORED = "[censored]";

export function Markdown({
  text,
  secrets = [],
  overrides = [],
  onFact,
  onAction,
}: {
  text: string;
  /** Sensitive values (SSN, card number, …) shown masked until revealed. */
  secrets?: string[];
  overrides?: FactOverride[];
  onFact?: (fact: TwinFact) => void;
  /** Per-fact menu; action "restore" undoes an edit. */
  onAction?: (fact: TwinFact, action: FactAction | "restore", value?: string) => void;
}) {
  const inline = (s: string) => renderInline(s, secrets);
  return (
    <div className="space-y-0.5 text-[14px] leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ") || line.startsWith("# "))
          return (
            <h3 key={i} className="pt-3 pb-0.5 text-xs font-bold uppercase tracking-wider text-brand-dark">
              {line.replace(/^#+\s*/, "").replace(/\s*\(.*\)\s*$/, "")}
            </h3>
          );
        if (/^\s*[-*]\s/.test(line)) {
          const body = line.replace(/^\s*[-*]\s/, "");
          const source = body.match(SOURCE_RE);
          const content = source ? body.slice(0, source.index) : body;
          if (source && onFact) {
            const m = content.match(/^\*\*([^*]+?):?\*\*:?\s*(.*)$/);
            const fact = {
              label: m ? m[1].replace(/:$/, "") : "",
              value: m ? m[2] : content.replace(/\*\*/g, ""),
              sources: source[1],
            };
            const override = overrides.find((o) => o.label === fact.label.toLowerCase());
            return (
              <FactRow
                key={i}
                fact={fact}
                edited={override?.action === "edit"}
                onView={() => onFact(fact)}
                onAction={onAction && fact.label ? (a, v) => onAction(fact, a, v) : undefined}
              >
                {fact.value === CENSORED ? (
                  <>
                    <strong>{fact.label}:</strong> <Redacted />
                  </>
                ) : (
                  inline(content)
                )}
              </FactRow>
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

function FactRow({
  fact,
  edited,
  onView,
  onAction,
  children,
}: {
  fact: TwinFact;
  edited: boolean;
  onView: () => void;
  onAction?: (action: FactAction | "restore", value?: string) => void;
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.value);
  const menuRef = useRef<HTMLDivElement>(null);
  const censored = fact.value === CENSORED;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  if (editing)
    return (
      <form
        className="-mx-2 flex items-center gap-2 rounded-lg bg-brand/10 px-2 py-1 pl-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && draft.trim() !== fact.value) onAction?.("edit", draft.trim());
          setEditing(false);
        }}
      >
        <span className="text-brand">•</span>
        <strong className="shrink-0">{fact.label}:</strong>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-0.5 outline-none focus:border-brand"
        />
        <button type="submit" className="rounded-md bg-navy px-2.5 py-0.5 text-xs font-semibold text-white">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-navy">
          Cancel
        </button>
      </form>
    );

  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-bg";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !censored && onView()}
      onKeyDown={(e) => e.key === "Enter" && !censored && onView()}
      className={`group relative -mx-2 flex gap-2 rounded-lg px-2 py-0.5 pl-3 pr-8 transition ${
        censored ? "cursor-default" : "hover:bg-brand/10"
      } ${menu ? "bg-brand/10" : ""}`}
    >
      <span className="text-brand">•</span>
      <span>
        {children}
        {edited && (
          <span className="ml-1.5 rounded-full bg-bg px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted">
            Edited
          </span>
        )}
      </span>
      {onAction && (
        <div ref={menuRef} className="absolute right-1 top-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={`Options for ${fact.label}`}
            onClick={() => setMenu(!menu)}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-muted transition hover:bg-white hover:text-navy ${
              menu ? "bg-white text-navy opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          {menu && (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line bg-white p-1 shadow-lg">
              {!censored && (
                <>
                  <button type="button" className={item} onClick={() => (setMenu(false), onView())}>
                    View source
                  </button>
                  <button
                    type="button"
                    className={item}
                    onClick={() => {
                      setMenu(false);
                      setDraft(fact.value);
                      setEditing(true);
                    }}
                  >
                    Edit
                  </button>
                  {edited && (
                    <button type="button" className={item} onClick={() => (setMenu(false), onAction("restore"))}>
                      Restore original
                    </button>
                  )}
                  <button type="button" className={item} onClick={() => (setMenu(false), onAction("censor"))}>
                    Censor permanently
                  </button>
                </>
              )}
              <button
                type="button"
                className={`${item} text-red-600 hover:bg-red-50`}
                onClick={() => (setMenu(false), onAction("remove"))}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Redacted() {
  return (
    <span title="Censored. Formly will never show or share this." className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-block h-3.5 w-24 rounded-sm bg-navy" />
      <span className="text-xs text-muted">Censored</span>
    </span>
  );
}
