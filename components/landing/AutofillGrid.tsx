"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/Icons";
import { useHydrated } from "./motion";

type Field = { label: string; value: string; autofill?: boolean; suggested?: boolean };

/** The 33 fields of the T-Mobile sign-up, grouped as on the deck. `autofill`: a WHATWG autocomplete token covers it. */
const GROUPS: { name: string; fields: Field[] }[] = [
  {
    name: "Personal",
    fields: [
      { label: "First name", value: "Alex", autofill: true },
      { label: "Last name", value: "Chen", autofill: true },
      { label: "Email", value: "alex.chen.dev@gmail.com", autofill: true },
      { label: "Phone", value: "206-555-0147", autofill: true },
      { label: "Date of birth", value: "04/12/1999" },
      { label: "SSN", value: "•••-••-4821" },
    ],
  },
  {
    name: "Address",
    fields: [
      { label: "Street", value: "4521 Brooklyn Ave NE", autofill: true },
      { label: "Apt", value: "3B", autofill: true },
      { label: "City", value: "Seattle", autofill: true },
      { label: "State", value: "WA", autofill: true },
      { label: "ZIP", value: "98105", autofill: true },
      { label: "Years at address", value: "2" },
    ],
  },
  {
    name: "Payment",
    fields: [
      { label: "Name on card", value: "Alex Chen", autofill: true },
      { label: "Card number", value: "•••• 4242", autofill: true },
      { label: "Expiration", value: "08/29", autofill: true },
      { label: "Billing ZIP", value: "98105", autofill: true },
    ],
  },
  {
    name: "Identity",
    fields: [
      { label: "ID type", value: "Driver's license" },
      { label: "ID number", value: "•••• 7731" },
      { label: "Issuing state", value: "WA" },
      { label: "ID expiration", value: "04/12/2030" },
      { label: "Credit check", value: "Authorized" },
    ],
  },
  {
    name: "Employment",
    fields: [
      { label: "Employer", value: "Northwind Robotics" },
      { label: "Job title", value: "Software engineer" },
      { label: "Income", value: "$84,000" },
      { label: "Rent / mortgage", value: "$1,650 rent" },
    ],
  },
  {
    name: "Plan & device",
    fields: [
      { label: "Current carrier", value: "Verizon" },
      { label: "Device", value: "iPhone 15" },
      { label: "Plan", value: "Experience More", suggested: true },
      { label: "Lines", value: "1", suggested: true },
      { label: "Keep number", value: "Yes", suggested: true },
    ],
  },
  {
    name: "Emergency contact",
    fields: [
      { label: "Name", value: "Mia Chen" },
      { label: "Relationship", value: "Sister" },
      { label: "Phone", value: "425-555-0193" },
    ],
  },
];

const TOTAL = GROUPS.reduce((n, g) => n + g.fields.length, 0);
const AUTOFILL = GROUPS.reduce((n, g) => n + g.fields.filter((f) => f.autofill).length, 0);

type Mode = "autofill" | "formly";

/**
 * Browser autofill vs Formly on the same 33 fields. The server renders the Formly state (all filled), which is
 * what a visitor without JavaScript sees; once hydrated it starts on autofill so the gap shows first.
 */
export function AutofillGrid() {
  const hydrated = useHydrated();
  const [choice, setChoice] = useState<Mode | null>(null);
  const mode: Mode = choice ?? (hydrated ? "autofill" : "formly");
  const filled = mode === "formly" ? TOTAL : AUTOFILL;

  return (
    <div className="landing">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Who fills the form"
          className="inline-flex rounded-xl bg-mist p-1"
        >
          {(["autofill", "formly"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={!hydrated}
              onClick={() => setChoice(m)}
              className={`min-h-11 rounded-lg px-4 font-display text-[15px] font-semibold tracking-[-0.01em] transition-colors disabled:cursor-default ${
                mode === m ? "bg-navy text-white" : "text-slate hover:text-navy"
              }`}
            >
              {m === "autofill" ? "Browser autofill" : "Formly"}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="flex items-center gap-2 text-[15px] text-navy">
          {mode === "formly" && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
              <CheckIcon className="h-4 w-4" stroke={2} />
            </span>
          )}
          <span className="font-display text-[22px] font-semibold tracking-[-0.01em]">
            {filled} of {TOTAL}
          </span>
          <span className="text-slate">fields filled</span>
        </p>
      </div>

      <div className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <fieldset key={g.name} className="min-w-0">
            <legend className="text-[13px] font-medium text-slate">{g.name}</legend>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {g.fields.map((f) => {
                const isFilled = mode === "formly" || f.autofill;
                // Flash only the fields Formly adds, and only when the visitor flips the toggle.
                const flash = mode === "formly" && choice === "formly" && !f.autofill;
                return (
                  <li
                    key={f.label}
                    className={`min-w-0 rounded-lg px-2.5 py-1.5 ${
                      isFilled
                        ? `border border-rule bg-white ${flash ? "formly-filled" : "bg-[linear-gradient(var(--green),var(--green))] bg-[length:3px_100%] bg-left bg-no-repeat"}`
                        : "border border-dashed border-rule bg-transparent"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate">
                      <span className="truncate">{f.label}</span>
                      {isFilled && f.suggested && (
                        <span className="shrink-0 rounded bg-mist px-1 text-[11px] text-navy">suggested</span>
                      )}
                    </span>
                    <span className={`block truncate text-[14px] ${isFilled ? "text-navy" : "text-slate"}`}>
                      {isFilled ? f.value : "Empty"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
