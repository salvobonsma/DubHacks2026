"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Page background per route. Safari on iOS 26 tints its bottom bar from the page background (and the
 * top bar from whatever sits at the top) instead of reading theme-color, so each page sets its own.
 */
const PAGE_BG: [prefix: string, color: string][] = [
  ["/formly/fill", "#ffffff"],
  ["/formly", "#f3f4f6"],
  ["/tmobile", "#f5f5f5"],
  ["/spacexai", "#0a0a0a"],
  ["/chase", "#ffffff"],
  ["/demo", "#f3f4f6"],
  ["/", "#0f1a2a"],
];

/** Renders nothing: sets the html/body background for the current route. */
export function PageBackground() {
  const path = usePathname();

  useEffect(() => {
    const color = PAGE_BG.find(([prefix]) => (prefix === "/" ? path === "/" : path.startsWith(prefix)))?.[1];
    if (!color) return;
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
  }, [path]);

  return null;
}
