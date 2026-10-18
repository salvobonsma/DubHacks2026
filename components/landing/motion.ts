"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** False during the server render and hydration, true after. Lets an island start from its no-JS state. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the visitor asked for reduced motion. Assumed true on the server, so the finished state renders first. */
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
