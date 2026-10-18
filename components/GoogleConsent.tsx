"use client";

import { useState } from "react";

export type GoogleScope = "profile" | "contacts" | "gmail" | "drive";

const SCOPES: { id: GoogleScope; label: string; hint: string }[] = [
  { id: "profile", label: "Profile", hint: "Name, birthday, phone and address" },
  { id: "contacts", label: "Contacts", hint: "People you might list as family or emergency contacts" },
  { id: "gmail", label: "Gmail", hint: "Receipts and bills" },
  { id: "drive", label: "Drive", hint: "Documents like your resume" },
];

/** Fake "Sign in with Google" consent sheet for the mock connector. Every scope starts selected. */
export function GoogleConsent({
  onAllow,
  onCancel,
}: {
  onAllow: (scopes: GoogleScope[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<GoogleScope>>(new Set(SCOPES.map((s) => s.id)));

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
        <div className="mt-3 flex items-center gap-2 rounded-full border border-line px-2 py-1 text-sm w-fit">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#5b8def] text-xs text-white">
            A
          </span>
          alex.chen.dev@gmail.com
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
            onClick={() => onAllow(SCOPES.map((s) => s.id).filter((id) => selected.has(id)))}
            disabled={selected.size === 0}
            className="rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
