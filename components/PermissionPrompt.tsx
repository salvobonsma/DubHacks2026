"use client";

import { useEffect } from "react";

export interface PromptRequest {
  key: string;
  title: string;
  fields: { label: string; value: string; sensitive: boolean }[];
  sources: string[];
}

function mask(v: string) {
  return v.length <= 4 ? "••••" : `${"•".repeat(Math.min(v.length - 4, 8))}${v.slice(-4)}`;
}

/** Claude Code–style permission card: allow once / always allow / deny. */
export function PermissionPrompt({
  business,
  request,
  index,
  total,
  onDecide,
}: {
  business: string;
  request: PromptRequest;
  index: number;
  total: number;
  onDecide: (d: "once" | "always" | "deny") => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = ({ "1": "once", "2": "always", "3": "deny", Enter: "once", Escape: "deny" } as const)[
        e.key as "1" | "2" | "3" | "Enter" | "Escape"
      ];
      if (d) {
        e.preventDefault();
        onDecide(d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecide]);

  return (
    <div className="rounded-2xl border-2 border-navy bg-white p-4 shadow-lg">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span>Permission request</span>
        <span>
          {index + 1} of {total}
        </span>
      </div>
      <p className="mt-2 text-[15px]">
        <strong>{business}</strong> is asking for your <strong>{request.title}</strong>
      </p>
      <ul className="mt-3 space-y-1 rounded-lg bg-bg p-3 font-mono text-[12px]">
        {request.fields.map((f) => (
          <li key={f.label} className="flex justify-between gap-3">
            <span className="text-muted">{f.label}</span>
            <span className="truncate">{f.sensitive ? mask(f.value) : f.value}</span>
          </li>
        ))}
      </ul>
      {request.sources.length > 0 && (
        <p className="mt-2 text-xs text-muted">from {request.sources.join(", ")}</p>
      )}
      <div className="mt-4 space-y-2">
        <Choice n={1} onClick={() => onDecide("once")} primary>
          Allow once
        </Choice>
        <Choice n={2} onClick={() => onDecide("always")}>
          Always allow for {business}
        </Choice>
        <Choice n={3} onClick={() => onDecide("deny")}>
          Deny — I&apos;ll type it myself
        </Choice>
      </div>
    </div>
  );
}

function Choice({
  n,
  primary,
  onClick,
  children,
}: {
  n: number;
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition ${
        primary ? "border-navy bg-navy text-white hover:bg-black" : "border-line hover:border-navy"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded text-[11px] ${
          primary ? "bg-white/15" : "bg-bg text-muted"
        }`}
      >
        {n}
      </span>
      {children}
    </button>
  );
}
