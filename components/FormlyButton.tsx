"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "./Logo";
import type { FormSchema } from "@/lib/types";

export type FormlyValues = Record<string, string>;

/**
 * The embeddable "Fill with Formly" button. Opens the Formly popup (Stripe Checkout style)
 * and resolves with the approved field values via postMessage.
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
  const onFilledRef = useRef(onFilled);
  useEffect(() => {
    onFilledRef.current = onFilled;
  }, [onFilled]);

  useEffect(() => {
    const expected = formlyOrigin || window.location.origin;
    function handle(e: MessageEvent) {
      if (e.origin !== expected) return;
      const msg = e.data as { type?: string; sessionId?: string; values?: FormlyValues };
      if (msg?.sessionId !== sessionRef.current) return;
      if (msg.type === "formly:filled" && msg.values) onFilledRef.current(msg.values);
      if (msg.type === "formly:filled" || msg.type === "formly:cancelled") setBusy(false);
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [formlyOrigin]);

  async function open() {
    setBusy(true);
    // Open synchronously so popup blockers allow it, then point it at the session.
    const w = 480, h = 760;
    const popup = window.open(
      "about:blank",
      "formly",
      `width=${w},height=${h},left=${window.screenX + (window.outerWidth - w) / 2},top=${window.screenY + 60}`,
    );
    try {
      const res = await fetch(`${formlyOrigin}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema, origin: window.location.origin }),
      });
      const { sessionId } = await res.json();
      sessionRef.current = sessionId;
      const url = `${formlyOrigin}/formly/fill?session=${sessionId}`;
      if (popup) popup.location.href = url;
      else window.open(url, "formly");
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
      className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-navy px-5 py-3.5 text-[15px] font-semibold text-white transition hover:bg-black disabled:opacity-70"
    >
      <Mark light className="h-5 w-5" />
      {busy ? "Waiting for Formly…" : "Fill with Formly"}
    </button>
  );
}
