"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./Logo";
import type { FormSchema } from "@/lib/types";

export type FormlyValues = Record<string, string>;

interface SessionResult {
  status: string;
  values: FormlyValues | null;
  /** Ids among values that were Formly's suggestions rather than facts from the user's data. */
  suggested?: string[];
}

/** What arrives with the answers: which of them were suggestions, so the page can mark them differently. */
export interface FormlyMeta {
  suggested: string[];
}

/** Phones get the same-tab flow: a popup there is a second tab the user has to find their way back from. */
function isPhone() {
  return window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 820px)").matches;
}

/**
 * The embeddable "Fill with Formly" button. Opens the Formly popup (Stripe Checkout style) and
 * resolves with the approved field values. Values arrive by postMessage from the popup, by polling
 * the session (if the popup lost its opener), or via ?formly_session= after a same-tab redirect.
 * On a phone it is always the same-tab flow. A merchant with a schema.theme gets a button in its own
 * style (its secondary button, with a small "Powered by Formly" line), the way Apple Pay or Link sit
 * in a checkout; without one it is the Formly button.
 */
export function FormlyButton({
  schema,
  onFilled,
  formlyOrigin = process.env.NEXT_PUBLIC_FORMLY_ORIGIN ?? "",
  tone = "light",
}: {
  schema: FormSchema;
  onFilled: (values: FormlyValues, meta: FormlyMeta) => void;
  formlyOrigin?: string;
  /** The page behind the button: "light" gets the Ink button, "dark" gets a white one with Ink text. */
  tone?: "light" | "dark";
}) {
  const [busy, setBusy] = useState(false);
  /** Answers are in: a beat of "Returning to {business}" before the page takes them. */
  const [returning, setReturning] = useState(false);
  /** The open flow is a popup window (desktop), not a same-tab redirect. */
  const [viaPopup, setViaPopup] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const onFilledRef = useRef(onFilled);
  useEffect(() => {
    onFilledRef.current = onFilled;
  }, [onFilled]);

  // Deliver once per session, whichever channel gets there first.
  const deliver = useRef((sessionId: string, values: FormlyValues | null, suggested: string[] = []) => {
    if (sessionRef.current !== sessionId) return;
    sessionRef.current = null;
    popupRef.current = null;
    setBusy(false);
    if (!values) return;
    setReturning(true);
    setTimeout(() => {
      setReturning(false);
      onFilledRef.current(values, { suggested });
    }, 600);
  });

  // Back from the same-tab flow through the browser's back button: the page comes out of the back-forward
  // cache as it was left, mid-"Opening Formly", so free the button again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      sessionRef.current = null;
      setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const fetchSession = (id: string): Promise<SessionResult> =>
    fetch(`${formlyOrigin}/api/sessions?id=${id}`).then((r) => r.json());

  // Channel 1: postMessage from the popup.
  useEffect(() => {
    const expected = formlyOrigin || window.location.origin;
    function handle(e: MessageEvent) {
      if (e.origin !== expected) return;
      const msg = e.data as { type?: string; sessionId?: string; values?: FormlyValues; suggested?: string[] };
      if (!msg?.sessionId) return;
      if (msg.type === "formly:filled") deliver.current(msg.sessionId, msg.values ?? null, msg.suggested ?? []);
      if (msg.type === "formly:cancelled") deliver.current(msg.sessionId, null);
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [formlyOrigin]);

  // Channel 2: returning from a same-tab flow with ?formly_session=<id>.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("formly_session");
    if (!id) return;
    url.searchParams.delete("formly_session");
    window.history.replaceState(null, "", url);
    sessionRef.current = id;
    fetchSession(id).then((s) => deliver.current(id, s.values, s.suggested));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Channel 3: poll while the popup is open, in case postMessage can't reach us. A popup that went through
  // Google's sign-in looks closed from here (Google's pages cut the window link) while the user is still
  // approving in it, so a "closed" popup keeps being polled for a while; the button frees up meanwhile in
  // case the user really did close it.
  const [popupGone, setPopupGone] = useState(false);
  const goneSince = useRef(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const id = sessionRef.current;
      if (!id) return;
      const closed = popupRef.current?.closed ?? false;
      const s = await fetchSession(id).catch(() => null);
      if (s?.status === "completed") deliver.current(id, s.values, s.suggested);
      else if (s?.status === "cancelled") deliver.current(id, null);
      else if (closed) {
        goneSince.current ||= Date.now();
        setPopupGone(true);
        if (Date.now() - goneSince.current > 10 * 60_000) deliver.current(id, null);
      }
    }, 1000);
    return () => {
      clearInterval(t);
      setPopupGone(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  /** Clicking while waiting: the popup may be lost behind other windows, so close it and start over. */
  function reset() {
    const id = sessionRef.current;
    try {
      popupRef.current?.close();
    } catch {}
    sessionRef.current = null;
    popupRef.current = null;
    setBusy(false);
    if (id)
      fetch(`${formlyOrigin}/api/sessions`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id, status: "cancelled" }),
      }).catch(() => {});
  }

  async function open() {
    if (busy) return reset();
    setBusy(true);
    setPopupGone(false);
    goneSince.current = 0;
    // Open synchronously so popup blockers allow it, then point it at the session. Phones skip the popup.
    const w = 480, h = 760;
    const popup = isPhone()
      ? null
      : window.open(
          "about:blank",
          "formly",
          `popup,width=${w},height=${h},left=${window.screenX + (window.outerWidth - w) / 2},top=${window.screenY + 60}`,
        );
    popupRef.current = popup;
    setViaPopup(!!popup);
    try {
      const res = await fetch(`${formlyOrigin}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema, returnUrl: window.location.href }),
      });
      const { sessionId } = await res.json();
      sessionRef.current = sessionId;
      const url = `${formlyOrigin}/formly/fill?session=${sessionId}`;
      // Phone or popup blocked: same-tab flow, Formly redirects back. A full load, since formlyOrigin may be
      // another site. The page's pagehide keeps its step and answers for the return trip.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (!popup) window.location.href = url;
      else if (popup.closed) deliver.current(sessionId, null); // closed before it finished loading
      else popup.location.href = url;
    } catch (err) {
      popup?.close();
      setBusy(false);
      console.error(err);
    }
  }

  const waiting = busy && !popupGone;
  const label = returning
    ? `Returning to ${schema.business}`
    : waiting
      ? viaPopup
        ? "Waiting for Formly…"
        : "Opening Formly…"
      : null;

  const theme = schema.theme;
  if (theme) {
    return (
      <div>
        <button
          type="button"
          onClick={open}
          disabled={waiting || returning}
          style={{
            borderColor: theme.colors.text,
            color: theme.colors.text,
            borderRadius: theme.radius.button,
            fontFamily: theme.font,
          }}
          className="flex min-h-12 w-full items-center justify-center gap-2 border-2 bg-transparent px-4 py-2.5 text-base leading-5 font-semibold transition-colors hover:bg-black/[0.04] disabled:opacity-60"
        >
          {label ?? theme.buttonLabel ?? "Fill it in for me"}
        </button>
        <p
          className="mt-1.5 flex items-center justify-center gap-1 text-xs leading-4"
          style={{ color: theme.colors.muted, fontFamily: theme.font }}
        >
          <Mark className="h-3 w-3" />
          Powered by Formly
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={waiting || returning}
      className={`flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 font-display text-[15px] font-semibold tracking-[-0.01em] transition disabled:opacity-70 ${
        tone === "dark" ? "bg-white text-navy hover:bg-white/85" : "bg-navy text-white hover:bg-black"
      }`}
    >
      <Mark light={tone !== "dark"} className="h-5 w-5" />
      {label ?? "Fill with Formly"}
    </button>
  );
}
