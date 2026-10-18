"use client";

import Link from "next/link";

/**
 * Header and footer laid out like t-mobile.com's flow pages (white transactional bar with the step title; black
 * footer with link columns). The footer links are inert: this is a demo page, the only working links are the
 * logo and "Back to demo forms".
 */

const FOOTER_COLUMNS: [string, string[]][] = [
  ["Support", ["Contact us", "Check order status", "Return policy"]],
  ["Shop", ["Phones", "Plans", "Deals", "Bring your own phone"]],
  ["About", ["About T-Mobile", "Newsroom", "Careers"]],
];

/**
 * The flow pages' transactional header on t-mobile.com (plan/TMOBILE-REVERSED.md): 56px, logo, the step title at
 * 16/600, a cart icon with its magenta count, and a thin magenta progress bar underneath. The site shows the
 * T-digit alone there; the mock uses the full logo, which is the asset we have and the brand guide's default.
 */
export function TmFlowHeader({ title, progress, cart = 0 }: { title: string; progress: number; cart?: number }) {
  return (
    <header className="tm-header sticky top-0 z-20">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/tmobile" aria-label="T-Mobile home" className="flex-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tmobile/logo.png" alt="T-Mobile" className="h-5 w-auto" />
        </Link>
        <span className="min-w-0 flex-1 truncate text-base leading-5 font-semibold text-[var(--tm-text)]">{title}</span>
        <span className="tm-icon-btn" aria-label={cart ? `Cart, ${cart} line${cart === 1 ? "" : "s"}` : "Cart"} role="img">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.1" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9.5" cy="19.5" r="1.3" />
            <circle cx="17" cy="19.5" r="1.3" />
          </svg>
          {cart > 0 && <span className="tm-badge">{cart}</span>}
        </span>
      </div>
      <div className="tm-progress rounded-none" aria-hidden>
        <div style={{ width: `${Math.round(progress * 100)}%`, borderRadius: 0 }} />
      </div>
    </header>
  );
}

export function TmFooter() {
  return (
    <footer className="tm-footer">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tmobile/logo-white.png" alt="T-Mobile" className="h-6 w-auto" />
        <div className="mt-8 grid grid-cols-2 gap-8 md:grid-cols-4">
          {FOOTER_COLUMNS.map(([head, links]) => (
            <div key={head}>
              <p className="tm-footer-head">{head}</p>
              <ul className="mt-3 space-y-2">
                {links.map((l) => (
                  <li key={l} className="tm-footer-link">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="tm-footer-head">Demo</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/demo" className="tm-footer-link underline underline-offset-4">
                  Back to demo forms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--tm-gray-800)] pt-6">
          <span className="tm-footer-link">Español</span>
          <span className="tm-footer-link">Privacy center</span>
          <span className="tm-footer-link">Your privacy choices</span>
          <span className="tm-footer-link">Terms and conditions</span>
        </div>
        <p className="tm-footer-legal mt-6 max-w-3xl">
          A demo signup page for Formly, styled after T-Mobile&apos;s signup. Not affiliated with T-Mobile. T-Mobile, the T
          logo, Magenta and the magenta color are registered trademarks of Deutsche Telekom AG.
        </p>
      </div>
    </footer>
  );
}
