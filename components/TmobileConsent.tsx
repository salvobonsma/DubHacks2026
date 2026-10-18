"use client";

import { useEffect, useState } from "react";
import { ConnectorLogo } from "./ConnectorLogo";
import { LockIcon } from "./Icons";

export type TmobileScope = "account" | "devices" | "billing";

const SCOPES: { id: TmobileScope; label: string; hint: string }[] = [
  { id: "account", label: "Account & plan", hint: "Your lines, plan, data use and how long you've been with us" },
  { id: "devices", label: "Phones", hint: "Each line's phone, financing and trade-in value" },
  { id: "billing", label: "Billing", hint: "Your monthly bill totals for the last year" },
];

interface Account {
  id: string;
  name: string;
  email: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}

function Avatar({ account, size = "h-9 w-9 text-sm" }: { account: Account; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#E20074] font-semibold text-white ${size}`}>
      {initials(account.name)}
    </span>
  );
}

/**
 * Fake "Sign in with T-Mobile" sheet for the mock T-Mobile connector, the same idea as GoogleConsent and
 * AppleConsent. Every scope starts checked, and the account row switches between the demo personas.
 */
export function TmobileConsent({
  onAllow,
  onCancel,
}: {
  onAllow: (scopes: TmobileScope[], account: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<TmobileScope>>(new Set(SCOPES.map((s) => s.id)));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountIdx, setAccountIdx] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const account = accounts[accountIdx];

  useEffect(() => {
    fetch("/api/connectors/tmobile")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []));
  }, []);

  function toggle(id: TmobileScope) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 m-0 overflow-y-auto bg-black/40">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-[#000] shadow-2xl" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
          <div className="flex items-center gap-2 bg-[#E20074] px-6 py-4 text-white">
            <ConnectorLogo slug="tmobile" className="h-7 w-7 rounded-md ring-1 ring-white/40" />
            <span className="text-lg font-bold tracking-tight">T-Mobile</span>
          </div>
          <div className="p-6">
            <h2 className="text-xl leading-tight font-bold">Share your T-Mobile account with Formly</h2>

            <div className="relative mt-5">
              <button
                type="button"
                onClick={() => setChoosing(!choosing)}
                disabled={!account}
                className="flex w-full items-center gap-3 rounded-lg border border-[#cccccc] px-3 py-2.5 text-left transition hover:border-[#E20074]"
              >
                {account ? <Avatar account={account} /> : <span className="h-9 w-9 rounded-full bg-[#e8e8e8]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{account?.name ?? "Loading…"}</span>
                  <span className="block truncate text-[13px] text-[#6a6a6a]">{account?.email ?? ""}</span>
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6a6a6a]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {choosing && (
                <div className="absolute z-10 mt-1 w-full rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/10">
                  <p className="px-3 pt-1.5 pb-1 text-xs font-bold text-[#6a6a6a]">Use a different T-Mobile ID</p>
                  <div className="max-h-64 overflow-y-auto">
                    {accounts.map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAccountIdx(i);
                          setChoosing(false);
                        }}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#f7f7f7] ${i === accountIdx ? "bg-[#f7f7f7]" : ""}`}
                      >
                        <Avatar account={a} size="h-8 w-8 text-xs" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{a.name}</span>
                          <span className="block truncate text-xs text-[#6a6a6a]">{a.email}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="mt-5 mb-1.5 text-[13px] font-bold">Formly will be able to see:</p>
            <div className="space-y-1">
              {SCOPES.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2 hover:bg-[#f7f7f7]">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="mt-0.5 h-4 w-4 accent-[#E20074]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{s.label}</span>
                    <span className="block text-[12px] leading-snug text-[#6a6a6a]">{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[#6a6a6a]">
              <LockIcon className="h-2.5 w-2.5" stroke={1.25} /> Secure with Formly
            </p>

            <button
              onClick={() =>
                account &&
                onAllow(
                  SCOPES.map((s) => s.id).filter((id) => selected.has(id)),
                  account.id,
                )
              }
              disabled={selected.size === 0 || !account}
              className="mt-5 w-full rounded-full bg-[#E20074] py-3 text-base font-bold text-white transition hover:bg-[#c00063] disabled:opacity-40"
            >
              Allow
            </button>
            <button onClick={onCancel} className="mt-2 w-full py-2 text-[15px] font-bold text-[#E20074] hover:underline">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
