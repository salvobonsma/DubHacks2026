"use client";

import { useMemo, useState } from "react";
import { FormlyButton, type FormlyValues } from "@/components/FormlyButton";
import schemaJson from "@/lib/schemas/spacexai.json";
import type { FormField, FormSchema } from "@/lib/types";
import { countWords } from "@/lib/words";

const schema = schemaJson as FormSchema;

export default function SpaceXAIApplication() {
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
  const tooLong = schema.fields.filter((f) => f.maxWords && countWords(values[f.id] ?? "") > f.maxWords).length;

  if (submitted) {
    return (
      <Shell>
        <div className="sx-card text-center">
          <div className="sx-check" aria-hidden>
            <svg className="icon-line" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="sx-h1 !text-[28px]">Application received</h1>
          <p className="sx-secondary mt-3">
            Thanks, {values.first_name || "there"}. An engineer on the team reads every application. If it&apos;s a
            fit, a recruiter will reach out within two weeks.
          </p>
          <button className="sx-btn mt-8" onClick={() => location.reload()}>
            Start over
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="sx-eyebrow">AI Infrastructure · Redmond, WA · Full-time</p>
      <h1 className="sx-h1 mt-3">Software Engineer, AI Infrastructure</h1>
      <p className="mt-4 max-w-2xl">{schema.context}</p>

      <div className="sx-card mt-10">
        <h2 className="sx-h3">Apply for this job</h2>
        <p className="sx-secondary mt-2 text-sm">
          <span className="sx-num">{done}</span> of <span className="sx-num">{schema.fields.length}</span> fields
          complete.
        </p>

        <div className="mt-6">
          <FormlyButton schema={schema} onFilled={applyFormly} />
          <p className="sx-secondary mt-2 text-center text-xs">
            Fills this application from your resume, including the two short answers.
          </p>
        </div>
        <div className="sx-secondary mt-6 mb-3 flex items-center gap-3 text-sm">
          <div className="sx-divider" />
          <span>Or fill it in yourself</span>
          <div className="sx-divider" />
        </div>

        <p className="sx-secondary mb-3 text-sm">
          Fields marked <span className="sx-required">*</span> are required.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!missing && !tooLong) setSubmitted(true);
          }}
          className="space-y-10"
        >
          {sections.map(([section, fields]) => (
            <fieldset key={section}>
              <legend className="sx-h3 mb-5">{section}</legend>
              <div className="grid gap-5 sm:grid-cols-2">
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
            <button type="submit" disabled={missing > 0 || tooLong > 0} className="sx-btn w-full">
              Submit application
            </button>
            {(missing > 0 || tooLong > 0) && (
              <p className="sx-secondary mt-3 text-center text-sm">
                {missing > 0
                  ? `Fill in ${missing} more required field${missing === 1 ? "" : "s"} to submit.`
                  : `Shorten ${tooLong === 1 ? "your answer" : "your answers"} to fit the word limit.`}
              </p>
            )}
          </div>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sx-header">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <span className="sx-wordmark">SPACEXAI</span>
          <span className="sx-nav">Careers</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
      <footer className="sx-legal mx-auto w-full max-w-3xl px-6 pb-8">
        A demo careers page for Formly. Not affiliated with SpaceX or xAI.
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
  const cls = `sx-input ${filled ? "formly-filled" : ""}`;
  const title = filled ? "Filled by Formly" : undefined;
  const required = field.required && <span className="sx-required"> *</span>;

  if (field.type === "textarea") {
    const words = countWords(value);
    const over = !!field.maxWords && words > field.maxWords;
    return (
      <label className="block sm:col-span-2">
        <span className="sx-question">
          {field.label}
          {required}
        </span>
        <textarea
          className={cls}
          title={title}
          rows={5}
          value={value}
          required={field.required}
          placeholder={field.maxWords ? `About ${field.maxWords} words` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.maxWords && (
          <p className={`sx-count ${over ? "sx-count-over" : ""}`}>
            {words} / {field.maxWords} words
          </p>
        )}
      </label>
    );
  }

  return (
    <label className="block">
      <span className="sx-label">
        {field.label}
        {required}
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
