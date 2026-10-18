"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormlyButton, type FormlyValues } from "@/components/FormlyButton";
import schemaJson from "@/lib/schemas/dmv.json";
import type { FormField, FormSchema } from "@/lib/types";

const schema = schemaJson as FormSchema;

/** Helper text the DMV prints under some fields, paraphrased. */
const HELP: Record<string, string> = {
  vin: "Find it on the driver's side dashboard, the door jamb, or your current registration card.",
  current_plate: "Do not use blank spaces or special characters.",
  odometer: "Enter the miles shown, without tenths.",
  lienholder: "The bank or lender on your loan, if you have one.",
};

/** Section intros, in the DMV's question-style voice. */
const INTRO: Record<string, string> = {
  "Vehicle Information": "What vehicle are you titling or registering?",
  "Registered Owner": "Who will be the registered owner?",
  Lienholder: "Does a bank or lender have an interest in this vehicle?",
  Insurance: "California requires proof of insurance for every registered vehicle.",
};

/** A California DMV Application for Title or Registration, laid out like the DMV's online vehicle apps. */
export default function DmvApplication() {
  const [values, setValues] = useState<FormlyValues>({});
  const [filledKeys, setFilledKeys] = useState<Set<string>>(new Set());
  const [fillCount, setFillCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const sections = useMemo(() => {
    const map = new Map<string, FormField[]>();
    for (const f of schema.fields) map.set(f.section, [...(map.get(f.section) ?? []), f]);
    return [...map.entries()];
  }, []);

  function applyFormly(incoming: FormlyValues) {
    setValues((v) => ({ ...v, ...incoming }));
    setFilledKeys(new Set(Object.keys(incoming)));
    setFillCount((c) => c + 1);
  }

  const missing = schema.fields.filter((f) => f.required && !values[f.id]?.trim()).length;

  return (
    <div className="flex flex-1 flex-col">
      <header className="dmv-bar">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dmv/logo-ca-gov.svg" alt="CA.gov" className="h-9 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dmv/logo-ca-dmv-white.svg" alt="California DMV" className="h-9 w-auto" />
        </div>
      </header>

      <div className="dmv-banner">
        <div className="mx-auto max-w-5xl px-5 pt-10 pb-24">
          <h1 className="dmv-banner-title">Title or Register a Vehicle</h1>
        </div>
      </div>

      <main className="mx-auto -mt-16 w-full max-w-5xl flex-1 px-4 pb-12 sm:px-5">
        <div className="dmv-card px-5 pt-6 pb-10 sm:px-14">
          <nav className="flex flex-wrap items-center gap-y-2">
            <Link href="/demo" className="dmv-crumb">
              Home
            </Link>
            <span className="dmv-crumb">Vehicle Registration</span>
          </nav>
          <p className="dmv-app-name mt-4">Application for Title or Registration (REG 343)</p>
          <hr className="mt-4 border-[var(--dmv-line)]" />

          {submitted ? (
            <div className="py-12 text-center">
              <h2 className="dmv-h2">Your application was received</h2>
              <p className="mx-auto mt-3 max-w-md">
                Thanks, {values.owner_name || "there"}. This is a demo, so nothing was sent to the DMV.
              </p>
              <button className="dmv-btn mt-8" onClick={() => location.reload()}>
                Start over
              </button>
            </div>
          ) : (
            <>
              <p className="dmv-required-note mt-6 text-right">
                Required<span className="dmv-req">*</span>
              </p>
              <h2 className="dmv-h2 mt-6">Enter Vehicle and Owner Information</h2>

              <div className="mt-6 max-w-md">
                <FormlyButton schema={schema} onFilled={applyFormly} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!missing) setSubmitted(true);
                }}
                className="mt-10 space-y-12"
              >
                {sections.map(([section, fields]) => (
                  <fieldset key={section}>
                    <legend className="contents">
                      <h3 className="dmv-h3">{section}</h3>
                    </legend>
                    {INTRO[section] && <p className="dmv-intro mt-2">{INTRO[section]}</p>}
                    <div className="mt-6 grid gap-x-6 gap-y-7 sm:grid-cols-2">
                      {fields.map((f) => (
                        <Field
                          key={`${f.id}-${filledKeys.has(f.id) ? fillCount : 0}`}
                          field={f}
                          value={values[f.id] ?? ""}
                          highlight={filledKeys.has(f.id)}
                          onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))}
                        />
                      ))}
                    </div>
                  </fieldset>
                ))}

                <div className="flex flex-col items-center gap-4 pt-2">
                  <button type="submit" disabled={missing > 0} className="dmv-btn">
                    Continue
                  </button>
                  {missing > 0 && (
                    <p className="dmv-helper">
                      Fill in {missing} more required field{missing === 1 ? "" : "s"} to continue.
                    </p>
                  )}
                  <Link href="/demo" className="dmv-link">
                    Cancel
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="dmv-footer">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-5 py-8 text-center text-[13px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dmv/logo-ca-dmv-white.svg" alt="California DMV" className="h-8 w-auto opacity-90" />
          <p>
            A demo application page for Formly, styled after the California DMV&apos;s online services. Not affiliated
            with the State of California. Nothing you enter here leaves this page.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Field({
  field,
  value,
  highlight,
  onChange,
}: {
  field: FormField;
  value: string;
  highlight: boolean;
  onChange: (v: string) => void;
}) {
  const filled = highlight && !!value;
  const cls = `dmv-input ${filled ? "formly-filled" : ""}`;
  const title = filled ? "Filled by Formly" : undefined;
  const wide = field.id === "lienholder" || field.id === "street";

  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="dmv-label">
        {field.label}
        {field.required && <span className="dmv-req">*</span>}
      </span>
      {field.type === "select" ? (
        <span className="relative block">
          <select
            className={cls}
            title={title}
            value={value}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Select</option>
            {field.options?.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <svg className="dmv-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <polyline points="3,6 8,11 13,6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <input
          className={cls}
          title={title}
          type={field.type}
          value={value}
          required={field.required}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {HELP[field.id] && <span className="dmv-helper block">{HELP[field.id]}</span>}
    </label>
  );
}
