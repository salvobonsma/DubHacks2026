"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./Logo";
import type { FormSchema } from "@/lib/types";

export type FormlyValues = Record<string, string>;

interface SessionResult {
  status: string;
  values: FormlyValues | null;
}

/**
 * The embeddable "Fill with Formly" button. Opens the Formly popup (Stripe Checkout style) and
 * resolves with the approved field values. Values arrive by postMessage from the popup, by polling
 * the session (if the popup lost its opener), or via ?formly_session= after a same-tab redirect.
 */
export function FormlyButton({
  schema,
  onFilled,
  formlyOrigin = process.env.NEXT_PUBLIC_FORMLY_ORIGIN ?? "",
}: {
  schema: FormSchema;
  onFilled: (values: FormlyValues) => void;
  formlyOrigin?: string;
}) {
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const onFilledRef = useRef(onFilled);
  useEffect(() => {
    onFilledRef.current = onFilled;
  }, [onFilled]);

  // Deliver once per session, whichever channel gets there first.
  const deliver = useRef((sessionId: string, values: FormlyValues | null) => {
    if (sessionRef.current !== sessionId) return;
    sessionRef.current = null;
    popupRef.current = null;
    setBusy(false);
    if (values) onFilledRef.current(values);
  });

  const fetchSession = (id: string): Promise<SessionResult> =>
    fetch(`${formlyOrigin}/api/sessions?id=${id}`).then((r) => r.json());

  // Channel 1: postMessage from the popup.
  useEffect(() => {
    const expected = formlyOrigin || window.location.origin;
    function handle(e: MessageEvent) {
      if (e.origin !== expected) return;
      const msg = e.data as { type?: string; sessionId?: string; values?: FormlyValues };
      if (!msg?.sessionId) return;
      if (msg.type === "formly:filled") deliver.current(msg.sessionId, msg.values ?? null);
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
    fetchSession(id).then((s) => deliver.current(id, s.values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Channel 3: poll while the popup is open, in case postMessage can't reach us. If the user closes
  // the popup without finishing, stop waiting (after one last check in case it completed on close).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const id = sessionRef.current;
      if (!id) return;
      const closed = popupRef.current?.closed ?? false;
      const s = await fetchSession(id);
      if (s.status === "completed") deliver.current(id, s.values);
      else if (s.status === "cancelled" || closed) deliver.current(id, null);
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  async function open() {
    setBusy(true);
    // Open synchronously so popup blockers allow it, then point it at the session.
    const w = 480, h = 760;
    const popup = window.open(
      "about:blank",
      "formly",
      `popup,width=${w},height=${h},left=${window.screenX + (window.outerWidth - w) / 2},top=${window.screenY + 60}`,
    );
    popupRef.current = popup;
    try {
      const res = await fetch(`${formlyOrigin}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema, returnUrl: window.location.href }),
      });
      const { sessionId } = await res.json();
      sessionRef.current = sessionId;
      const url = `${formlyOrigin}/formly/fill?session=${sessionId}`;
      if (!popup) window.location.href = url; // popup blocked: same-tab flow, Formly redirects back
      else if (popup.closed) deliver.current(sessionId, null); // closed before it finished loading
      else popup.location.href = url;
    } catch (err) {
      popup?.close();
      setBusy(false);
      console.error(err);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-navy px-5 py-3.5 font-display text-[15px] font-semibold tracking-[-0.01em] text-white transition hover:bg-black disabled:opacity-70"
    >
      <Mark light className="h-5 w-5" />
      {busy ? "Waiting for Formly…" : "Fill with Formly"}
    </button>
  );
}
