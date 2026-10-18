"use client";

import { useEffect, useRef, useState } from "react";
import { clearPendingLink, finishPlaid, loadPlaidLink, takePendingLink } from "@/components/ConnectBank";
import { WarningIcon } from "@/components/Icons";
import { Logo } from "@/components/Logo";

type Phase = { kind: "working"; label: string } | { kind: "failed"; message: string; back: string };

/** Back to where Connect your bank was tapped, with ?connected=plaid or ?connect_error=… for ConnectPanel. */
function goBack(returnTo: string, result: { connected?: boolean; error?: string }) {
  const url = new URL(returnTo, window.location.origin);
  url.searchParams.delete("connected");
  url.searchParams.delete("connect_error");
  if (result.connected) url.searchParams.set("connected", "plaid");
  if (result.error) url.searchParams.set("connect_error", result.error);
  window.location.replace(url.toString());
}

export function PlaidOAuth() {
  const [phase, setPhase] = useState<Phase>({ kind: "working", label: "Finishing with your bank…" });
  // Strict Mode runs effects twice in dev; Link must only be reopened once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const pending = takePendingLink();
    if (!pending) {
      // Opened in another browser (the bank app returned to the default one) or after too long.
      clearPendingLink();
      setTimeout(
        () =>
          setPhase({
            kind: "failed",
            message: "This bank sign-in finished in a different browser or took too long. Go back and tap Connect your bank again.",
            back: "/formly",
          }),
        0,
      );
      return;
    }
    const { token, returnTo } = pending;
    loadPlaidLink()
      .then((Plaid) => {
        const handler = Plaid.create({
          token,
          receivedRedirectUri: window.location.href,
          onSuccess: async (publicToken, metadata) => {
            clearPendingLink();
            handler.destroy();
            setPhase({ kind: "working", label: "Reading your bank details…" });
            const r = await finishPlaid(publicToken, metadata.institution?.name);
            // "choose" goes back without a result: ConnectBank there asks which person is you.
            if (r.status === "failed") goBack(returnTo, { error: r.error });
            else goBack(returnTo, { connected: r.status === "imported" });
          },
          onExit: (err) => {
            clearPendingLink();
            handler.destroy();
            goBack(returnTo, err ? { error: err.display_message || err.error_message || "The bank connection didn't finish" } : {});
          },
        });
        handler.open();
      })
      .catch((e: Error) => setPhase({ kind: "failed", message: e.message, back: returnTo }));
  }, []);

  return (
    <div className="flex-1">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-md items-center px-4 py-3.5">
          <Logo light />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pt-6 pb-10">
        <section className="rounded-2xl bg-white p-6 text-center shadow-surface">
          {phase.kind === "working" ? (
            <>
              <h1 className="text-lg">Connecting your bank</h1>
              <p className="mt-2 text-sm text-muted" aria-live="polite">
                {phase.label}
              </p>
            </>
          ) : (
            <>
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700">
                <WarningIcon className="h-6 w-6" stroke={2} />
              </span>
              <h1 className="text-lg">Bank not connected</h1>
              <p className="mt-2 text-sm text-muted">{phase.message}</p>
              <a
                href={phase.back}
                className="mt-5 inline-flex min-h-11 items-center rounded-full bg-navy px-5 text-sm font-medium text-white transition-colors hover:bg-black"
              >
                Go back
              </a>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
