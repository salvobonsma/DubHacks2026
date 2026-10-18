"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/formly", label: "My Formly" },
  { href: "/demo", label: "Demo forms" },
];

/** The navy Formly header on Formly's own pages (/, /formly, /demo). Merchant pages get no Formly chrome. */
export function FormlyHeader() {
  const path = usePathname();
  return (
    <header className="bg-navy">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 sm:gap-x-4">
        <Link href="/" className="flex min-h-11 items-center" aria-label="Formly home">
          <Logo light />
        </Link>
        <nav className="-mr-1 ml-auto flex items-center text-[13px] sm:-mr-2 sm:text-[14px]">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              className={`flex min-h-11 items-center px-1 transition-colors sm:px-2 ${
                path === l.href ? "font-semibold text-white" : "text-white/70 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
