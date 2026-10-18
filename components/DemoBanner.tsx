"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./Logo";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/formly", label: "My Formly" },
  { href: "/tmobile", label: "Demo form" },
];

/** Thin site-wide strip, like the .gov "official website" banner, marking every page as a demo. */
export function DemoBanner() {
  const path = usePathname();
  return (
    <div className="border-b border-white/10 bg-[#0a121e] font-sans text-[12px] text-white/75">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5">
        <span className="flex items-center gap-2">
          <Mark light className="h-3.5 w-3.5" />
          <span>
            <strong className="font-semibold text-white">This is a Formly demo.</strong>
          </span>
        </span>
        <nav className="ml-auto flex items-center gap-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                path === l.href
                  ? "font-semibold text-white"
                  : "text-[#22C985] transition hover:text-white"
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
