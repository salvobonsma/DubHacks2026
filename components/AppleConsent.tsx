"use client";

import { useEffect, useState } from "react";
import { ConnectorLogo } from "./ConnectorLogo";
import { LockIcon } from "./Icons";

export type IcloudScope = "account" | "contacts" | "mail" | "drive" | "wallet" | "health";

const SCOPES: { id: IcloudScope; label: string; hint: string }[] = [
  { id: "account", label: "Apple Account", hint: "Name, birthday, phone, address and devices" },
  { id: "contacts", label: "Contacts", hint: "People you might list as family or emergency contacts" },
  { id: "mail", label: "iCloud Mail", hint: "Receipts and bills" },
  { id: "drive", label: "iCloud Drive", hint: "Documents like your resume and personal notes" },
  { id: "wallet", label: "Wallet", hint: "Cards and IDs, by last four digits" },
  { id: "health", label: "Health", hint: "Your Medical ID" },
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

/** Apple's gray-gradient monogram avatar. */
function Avatar({ account, size = "h-9 w-9 text-sm" }: { account: Account; size?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${size}`}
      style={{ background: "linear-gradient(180deg, #a5abb8 0%, #858994 100%)" }}
    >
      {initials(account.name)}
    </span>
  );
}

/** iOS-style switch. */
function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${on ? "bg-[#34c759]" : "bg-[#e9e9eb]"}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform ${on ? "translate-x-[18px]" : ""}`}
      />
    </button>
  );
}

/**
 * Fake "Sign in with Apple" sheet for the mock iCloud connector, the Apple twin of GoogleConsent. Every
 * scope starts on, and the account row switches between the demo personas in sample-data/.
 */
export function AppleConsent({
  onAllow,
  onCancel,
}: {
  onAllow: (scopes: IcloudScope[], account: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<IcloudScope>>(new Set(SCOPES.map((s) => s.id)));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountIdx, setAccountIdx] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const account = accounts[accountIdx];

  useEffect(() => {
    fetch("/api/connectors/icloud")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []));
  }, []);

  function toggle(id: IcloudScope) {
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
      <div
        className="w-full max-w-sm rounded-[22px] bg-[#f5f5f7] p-6 text-[#1d1d1f] shadow-2xl"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
      >
        <div className="flex justify-center">
          <ConnectorLogo slug="apple" className="h-9 w-9" />
        </div>
        <h2 className="mt-3 text-center text-[21px] leading-tight font-semibold" style={{ fontFamily: "inherit" }}>
          Sign in to Formly with your Apple Account
        </h2>

        <div className="relative mt-5">
          <button
            type="button"
            onClick={() => setChoosing(!choosing)}
            disabled={!account}
            className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left transition hover:bg-white/70"
          >
            {account ? <Avatar account={account} /> : <span className="h-9 w-9 rounded-full bg-[#e9e9eb]" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{account?.name ?? "Loading…"}</span>
              <span className="block truncate text-[13px] text-[#6e6e73]">{account?.email ?? ""}</span>
            </span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6e6e73]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {choosing && (
            <div className="absolute z-10 mt-1 w-full rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
              <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-[#6e6e73]">Use a different Apple Account</p>
              <div className="max-h-64 overflow-y-auto">
                {accounts.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setAccountIdx(i);
                      setChoosing(false);
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#f5f5f7] ${i === accountIdx ? "bg-[#f5f5f7]" : ""}`}
                  >
                    <Avatar account={a} size="h-8 w-8 text-xs" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-[#6e6e73]">{a.email}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mt-5 mb-1.5 px-1 text-[13px] text-[#6e6e73] uppercase">Share with Formly</p>
        <div className="divide-y divide-[#e5e5ea] overflow-hidden rounded-xl bg-white">
          {SCOPES.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">{s.label}</span>
                <span className="block text-[12px] leading-snug text-[#6e6e73]">{s.hint}</span>
              </span>
              <Toggle on={selected.has(s.id)} onChange={() => toggle(s.id)} label={s.label} />
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 px-1 text-[12px] text-[#6e6e73]">
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
          className="mt-5 w-full rounded-xl bg-[#0071e3] py-3 text-[17px] font-medium text-white transition hover:bg-[#0077ed] disabled:opacity-40"
        >
          Continue
        </button>
        <button onClick={onCancel} className="mt-2 w-full py-2 text-[15px] text-[#0066cc] hover:underline">
          Cancel
        </button>
      </div>
      </div>
    </div>
  );
}
