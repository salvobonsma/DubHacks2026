"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark } from "./Logo";

/**
 * Page background per route. Safari on iOS 26 tints its bottom bar from the page background (and the
 * top bar from this pinned banner) instead of reading theme-color, so each page sets its own.
 */
const PAGE_BG: [prefix: string, color: string][] = [
  ["/formly/fill", "#ffffff"],
  ["/formly", "#f3f4f6"],
  ["/tmobile", "#f5f5f5"],
  ["/spacexai", "#0a0a0a"],
  ["/chase", "#ffffff"],
  ["/dmv", "#f3f7fb"],
  ["/demo", "#f3f4f6"],
  ["/", "#0f1a2a"],
];

const LINKS = [
  { href: "/", label: "Home", match: ["/"] },
  { href: "/formly", label: "My Formly", match: ["/formly"] },
  { href: "/demo", label: "Demo forms", short: "Forms", match: ["/demo", "/tmobile", "/spacexai", "/chase", "/dmv"] },
];

/** Thin site-wide strip, like the .gov "official website" banner, marking every page as a demo. */
export function DemoBanner() {
  const path = usePathname();
  const [resetting, setResetting] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  // In-page confirm: the in-app browser silently blocks window.confirm().
  async function resetDemo() {
    setResetBusy(true);
    await Promise.all([fetch("/api/sources", { method: "DELETE" }), fetch("/api/grants", { method: "DELETE" })]);
    location.reload();
  }

  useEffect(() => {
    const color = PAGE_BG.find(([prefix]) => (prefix === "/" ? path === "/" : path.startsWith(prefix)))?.[1];
    if (!color) return;
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
  }, [path]);

  return (
    <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0a121e] font-sans text-[12px] text-white/75">
      <div className="mx-auto flex max-w-5xl items-center gap-4 whitespace-nowrap px-4 py-1.5">
        <span className="flex items-center gap-2">
          <Mark light className="h-3.5 w-3.5" />
          <span>
            <strong className="font-semibold text-white">
              <span className="sm:hidden">Demo</span>
              <span className="hidden sm:inline">This is a Formly demo.</span>
            </strong>
          </span>
        </span>
        <nav className="ml-auto flex items-center gap-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                l.match.includes(path)
                  ? "font-semibold text-white"
                  : "text-[#22C985] transition hover:text-white"
              }
            >
              {l.short ? (
                <>
                  <span className="sm:hidden">{l.short}</span>
                  <span className="hidden sm:inline">{l.label}</span>
                </>
              ) : (
                l.label
              )}
            </Link>
          ))}
          <span className="h-3 w-px bg-white/20" aria-hidden />
          <button onClick={() => setResetting(true)} className="text-white/60 transition hover:text-red-400">
            Reset<span className="hidden sm:inline"> demo</span>
          </button>
        </nav>
      </div>
      {resetting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 text-sm text-navy"
          onClick={() => !resetBusy && setResetting(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold">Reset the demo?</h2>
            <p className="mt-2 text-sm text-muted">This clears all the data.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setResetting(false)}
                disabled={resetBusy}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-bg"
              >
                Cancel
              </button>
              <button
                onClick={resetDemo}
                disabled={resetBusy}
                className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {resetBusy ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
