"use client";

import { useEffect, useState } from "react";

export type GoogleScope = "profile" | "contacts" | "gmail" | "drive";

const SCOPES: { id: GoogleScope; label: string; hint: string }[] = [
  { id: "profile", label: "Profile", hint: "Name, birthday, phone and address" },
  { id: "contacts", label: "Contacts", hint: "People you might list as family or emergency contacts" },
  { id: "gmail", label: "Gmail", hint: "Receipts and bills" },
  { id: "drive", label: "Drive", hint: "Documents like your resume and personal notes" },
];

interface Account {
  id: string;
  name: string;
  email: string;
}

const AVATAR_COLORS = ["#5b8def", "#e8710a", "#188038", "#a142f4", "#d93025", "#12b5cb", "#c26401", "#1967d2"];

function Avatar({ account, index, size = "h-6 w-6 text-xs" }: { account: Account; index: number; size?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full text-white ${size}`}
      style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
    >
      {account.name[0]}
    </span>
  );
}

/**
 * Fake "Sign in with Google" consent sheet for the mock connector. Every scope starts selected, and the
 * account chip switches between the demo personas in sample-data/.
 */
export function GoogleConsent({
  onAllow,
  onCancel,
}: {
  onAllow: (scopes: GoogleScope[], account: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<GoogleScope>>(new Set(SCOPES.map((s) => s.id)));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountIdx, setAccountIdx] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const account = accounts[accountIdx];

  useEffect(() => {
    fetch("/api/connectors/google")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []));
  }, []);

  function toggle(id: GoogleScope) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="text-2xl font-medium">
          <span className="text-[#4285F4]">G</span>
          <span className="text-[#EA4335]">o</span>
          <span className="text-[#FBBC05]">o</span>
          <span className="text-[#4285F4]">g</span>
          <span className="text-[#34A853]">l</span>
          <span className="text-[#EA4335]">e</span>
        </div>
        <h2 className="mt-3 text-xl">Formly wants to access your Google Account</h2>
        <div className="relative mt-3">
          <button
            type="button"
            onClick={() => setChoosing(!choosing)}
            disabled={!account}
            className="flex w-fit items-center gap-2 rounded-full border border-line py-1 pr-2.5 pl-1 text-sm transition hover:bg-bg"
          >
            {account ? (
              <Avatar account={account} index={accountIdx} />
            ) : (
              <span className="h-6 w-6 rounded-full bg-bg" />
            )}
            {account?.email ?? "Loading…"}
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {choosing && (
            <div className="absolute z-10 mt-1 w-full max-w-xs rounded-xl border border-line bg-white py-1 shadow-lg">
              <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted">Choose an account</p>
              <div className="max-h-64 overflow-y-auto">
                {accounts.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setAccountIdx(i);
                      setChoosing(false);
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg ${i === accountIdx ? "bg-blue-50" : ""}`}
                  >
                    <Avatar account={a} index={i} size="h-8 w-8 text-sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-muted">{a.email}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm font-medium">Choose what Formly can see:</p>
        <div className="mt-2 space-y-1.5">
          {SCOPES.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2 hover:bg-bg"
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggle(s.id)}
                className="mt-0.5 h-4 w-4 accent-[#1a73e8]"
              />
              <span>
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-xs text-muted">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Formly keeps this data in your digital twin. Businesses only get the answers you approve.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-medium text-[#1a73e8] hover:bg-blue-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              account &&
              onAllow(
                SCOPES.map((s) => s.id).filter((id) => selected.has(id)),
                account.id,
              )
            }
            disabled={selected.size === 0 || !account}
            className="rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
