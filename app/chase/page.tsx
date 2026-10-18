"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormlyButton, type FormlyValues } from "@/components/FormlyButton";
import schemaJson from "@/lib/schemas/chase.json";
import type { FormField, FormSchema } from "@/lib/types";

const schema = schemaJson as FormSchema;

/** Dollar amounts get Chase's "$" prefix inside the field. */
const MONEY = new Set(["annual_income", "housing_payment"]);

/** Short notes Chase shows under a section, paraphrased. */
const SECTION_NOTES: Record<string, string> = {
  Identification: "We ask for your SSN to verify who you are. We keep your information secure.",
  "Contact info": "We'll use your mobile number to reach you about your application and account.",
};

/** A Chase Freedom Unlimited application, laid out like Chase's own card application. */
export default function ChaseApplication() {
  const [values, setValues] = useState<FormlyValues>({});
  const [filledKeys, setFilledKeys] = useState<Set<string>>(new Set());
  const [fillCount, setFillCount] = useState(0);
  const [agreed, setAgreed] = useState(false);
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

  if (submitted) {
    return (
      <Shell>
        <div className="pt-6 text-center">
          <CardArt />
          <h1 className="ch-h1 mt-6">Thanks, {values.first_name || "there"}. We got your application.</h1>
          <p className="ch-note mx-auto mt-3 max-w-sm">
            We&apos;ll let you know our decision by email. This is a demo, so nothing was actually sent to Chase.
          </p>
          <button className="ch-btn mt-8" onClick={() => location.reload()}>
            Start over
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <CardArt />
      <h1 className="ch-h1 mt-6">Let&apos;s get started</h1>

      <div className="mt-6">
        <FormlyButton schema={schema} onFilled={applyFormly} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing && agreed) setSubmitted(true);
        }}
        className="mt-10 space-y-10"
      >
        {sections.map(([section, fields]) => (
          <fieldset key={section}>
            <legend className="contents">
              <h2 className="ch-h2">{section}</h2>
            </legend>
            {SECTION_NOTES[section] && <p className="ch-note mb-2">{SECTION_NOTES[section]}</p>}
            <div className="grid grid-cols-1 gap-x-5 gap-y-6 pt-2 min-[420px]:grid-cols-2">
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
            {section === "Financial info" && (
              <div className="ch-know mt-6 flex gap-3">
                <svg className="mt-0.5 shrink-0" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                  <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
                  <path d="M12 0.5v1M3.5 4l.8.7M20.5 4l-.8.7M1 11h1M22 11h1" strokeLinecap="round" />
                </svg>
                <div>
                  <h3 className="text-[18px] leading-7">You should know</h3>
                  <p className="ch-note mt-2">
                    Your total gross annual income is what you earn, or reasonably expect to earn, before taxes. If
                    you&apos;re 21 or older, you can include income from others that you regularly use to pay your
                    bills.
                  </p>
                </div>
              </div>
            )}
          </fieldset>
        ))}

        <fieldset>
          <legend className="contents">
            <h2 className="ch-h2">Certifications</h2>
          </legend>
          <p className="ch-note mb-4">
            By submitting, you confirm the information above is true and complete, and you agree to the account&apos;s
            pricing and terms. Formly never checks this box for you.
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="ch-check" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I&apos;ve read and agree to the above.</span>
          </label>
        </fieldset>

        <div className="text-center">
          <button type="submit" disabled={missing > 0 || !agreed} className="ch-btn">
            Submit
          </button>
          {(missing > 0 || !agreed) && (
            <p className="ch-note mt-3">
              {missing > 0
                ? `Fill in ${missing} more required field${missing === 1 ? "" : "s"} to submit.`
                : "Check the box above to submit."}
            </p>
          )}
        </div>
      </form>
    </Shell>
  );
}

function CardArt() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/chase/freedom-unlimited.png"
      alt="Chase Freedom Unlimited credit card"
      width={206}
      height={130}
      className="mx-auto"
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="ch-bar">
        <div className="flex h-16 items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chase/octagon-white.svg" alt="Chase" className="h-8 w-8" />
          </div>
          <Link href="/demo" className="font-semibold">
            Exit
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[478px] flex-1 px-6 pt-8 pb-12">{children}</main>
      <footer className="border-t border-[#e4e8ec] px-6 py-6">
        <div className="mx-auto flex max-w-[478px] flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chase/logo-blue.svg" alt="Chase" className="h-5 w-auto" />
          <p className="ch-legal">
            A demo application page for Formly, styled after Chase&apos;s card application. Not affiliated with
            JPMorgan Chase. Nothing you enter here leaves this page.
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
  const cls = `ch-control ${filled ? "formly-filled" : ""}`;
  const title = filled ? "Filled by Formly" : undefined;
  const money = MONEY.has(field.id);

  return (
    <label className="block">
      <span className="ch-label">{field.label}</span>
      <span className="relative block">
        {field.type === "select" ? (
          <>
            <select
              className={cls}
              title={title}
              value={value}
              required={field.required}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="">Choose one</option>
              {field.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <svg className="ch-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <polyline points="3,6 8,11 13,6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        ) : (
          <>
            {money && <span className="ch-prefix">$</span>}
            <input
              className={cls}
              style={money ? { paddingLeft: 16 } : undefined}
              title={title}
              type={field.type}
              value={value}
              required={field.required}
              placeholder={field.placeholder}
              onChange={(e) => onChange(e.target.value)}
            />
          </>
        )}
      </span>
    </label>
  );
}
