"use client";

import { useMemo, useState } from "react";
import { FormlyButton, type FormlyValues } from "@/components/FormlyButton";
import schemaJson from "@/lib/schemas/tmobile.json";
import type { FormField, FormSchema } from "@/lib/types";

const schema = schemaJson as FormSchema;

export default function TMobileSignup() {
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

  const done = schema.fields.filter((f) => values[f.id]?.trim()).length;
  const missing = schema.fields.filter((f) => f.required && !values[f.id]?.trim()).length;

  if (submitted) {
    return (
      <Shell>
        <div className="tm-card text-center">
          <div className="tm-check" aria-hidden>
            <svg className="icon-line" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="tm-h1">You&apos;re in, {values.first_name || "friend"}.</h1>
          <p className="tm-secondary mt-2">We got your application. Next stop, your new line.</p>
          <button className="tm-btn tm-btn-secondary mt-6" onClick={() => location.reload()}>
            Start over
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="tm-card">
        <h1 className="tm-h1">Create your account</h1>
        <p className="tm-secondary mt-2 text-sm">
          {schema.title}. <span className="tm-num">{done}</span> of{" "}
          <span className="tm-num">{schema.fields.length}</span> fields complete.
        </p>

        <div className="mt-6">
          <FormlyButton schema={schema} onFilled={applyFormly} />
        </div>
        <div className="tm-secondary my-6 flex items-center gap-3 text-sm">
          <div className="tm-divider" />
          <span>Or fill it in yourself</span>
          <div className="tm-divider" />
        </div>

        <p className="tm-secondary mb-6 text-sm">
          Fields marked <span className="tm-required">*</span> are required.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!missing) setSubmitted(true);
          }}
          className="space-y-8"
        >
          {sections.map(([section, fields]) => (
            <fieldset key={section}>
              <legend className="tm-h3 mb-4">{section}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
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
          <div>
            <button type="submit" disabled={missing > 0} className="tm-btn tm-btn-primary tm-btn-hero w-full">
              Submit
            </button>
            {missing > 0 && (
              <p className="tm-secondary mt-2 text-center text-sm">
                Fill in {missing} more required field{missing === 1 ? "" : "s"} to submit. That&apos;s about{" "}
                {timeLeft(missing)} of typing.
              </p>
            )}
          </div>
        </form>
      </div>
    </Shell>
  );
}

/** Rough manual-entry estimate: ~20 seconds per required field still empty. */
function timeLeft(fields: number) {
  const seconds = fields * 20;
  return seconds < 60 ? "1 min" : `${Math.round(seconds / 60)} min`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="tm-header">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tmobile/logo.png" alt="T-Mobile" className="h-7 w-auto" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">{children}</main>
      <footer className="tm-legal mx-auto w-full max-w-3xl px-6 pb-8">
        T-Mobile, the T logo, Magenta and the magenta color are registered trademarks of Deutsche Telekom AG.
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
  const cls = `tm-input ${filled ? "formly-filled" : ""}`;
  const title = filled ? "Filled by Formly" : undefined;
  return (
    <label className="block">
      <span className="tm-label">
        {field.label}
        {field.required && <span className="tm-required"> *</span>}
      </span>
      {field.type === "select" ? (
        <select
          className={cls}
          title={title}
          value={value}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
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
    </label>
  );
}
