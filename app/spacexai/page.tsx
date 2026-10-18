"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormlyButton, type FormlyValues } from "@/components/FormlyButton";
import schemaJson from "@/lib/schemas/spacexai.json";
import type { FormField, FormSchema } from "@/lib/types";
import { countWords } from "@/lib/words";

const schema = schemaJson as FormSchema;

/** A SpaceXAI job posting and application, laid out like their Greenhouse job board. */
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

  const missing = schema.fields.filter((f) => f.required && !values[f.id]?.trim()).length;
  const tooLong = schema.fields.filter((f) => f.maxWords && countWords(values[f.id] ?? "") > f.maxWords).length;

  if (submitted) {
    return (
      <Shell>
        <div className="py-16 text-center">
          <h1 className="sx-title">Thank you for applying.</h1>
          <p className="sx-secondary mx-auto mt-4 max-w-md">
            Thanks, {values.first_name || "there"}. Your application for Software Engineer, AI Infrastructure was
            received. An engineer on the team reads every application, and we&apos;ll reach out if it&apos;s a fit.
          </p>
          <button className="sx-pill mt-8" onClick={() => location.reload()}>
            Start over
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link href="/demo" className="sx-back">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to jobs
      </Link>

      <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="sx-badge">New</span>
          <h1 className="sx-title mt-2">Software Engineer, AI Infrastructure</h1>
          <p className="mt-2 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            Redmond, WA; Palo Alto, CA
          </p>
        </div>
        <a href="#apply" className="sx-pill shrink-0 self-start sm:self-center">
          Apply
        </a>
      </div>

      <div className="sx-desc mt-8">
        <h3>About the role:</h3>
        <p>{schema.context}</p>
        <h3>Responsibilities:</h3>
        <ul>
          <li>Design and run the ingest pipelines that carry vehicle and satellite telemetry to training clusters</li>
          <li>Find and fix the failures that only show up at fleet scale</li>
          <li>Work directly with the flight software and model training teams</li>
        </ul>
        <h3>Basic qualifications:</h3>
        <ul>
          <li>Bachelor&apos;s degree in computer science, engineering or a related field, or equivalent experience</li>
          <li>Experience shipping production software in Rust, C++, Go or Python</li>
        </ul>
      </div>

      <hr className="sx-rule mt-12" />

      <section id="apply" className="scroll-mt-16 pt-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="sx-h2">Apply for this job</h2>
            <p className="mt-1 text-[15px]">
              <span className="sx-required">*</span> indicates a required field
            </p>
          </div>
          <div className="sm:w-72">
            <FormlyButton schema={schema} onFilled={applyFormly} />
            <p className="sx-secondary mt-2 text-center text-[13px]">Fills this from your resume, short answers too</p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!missing && !tooLong) setSubmitted(true);
          }}
          className="mt-8 space-y-10"
        >
          {sections.map(([section, fields], i) => (
            <fieldset key={section} className="space-y-5">
              {i > 0 && <legend className="sx-subhead mb-4">{section}</legend>}
              {fields.map((f) => (
                <Field
                  key={`${f.id}-${filledKeys.has(f.id) ? fillCount : 0}`}
                  field={f}
                  value={values[f.id] ?? ""}
                  highlight={filledKeys.has(f.id)}
                  onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))}
                />
              ))}
            </fieldset>
          ))}
          <div>
            <button type="submit" disabled={missing > 0 || tooLong > 0} className="sx-pill">
              Submit application
            </button>
            {(missing > 0 || tooLong > 0) && (
              <p className="sx-secondary mt-3 text-[15px]">
                {missing > 0
                  ? `Fill in ${missing} more required field${missing === 1 ? "" : "s"} to submit.`
                  : `Shorten ${tooLong === 1 ? "your answer" : "your answers"} to fit the word limit.`}
              </p>
            )}
          </div>
        </form>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[760px] flex-1 px-6 pt-8 pb-12 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/spacexai/logo-white.png" alt="SpaceXAI" className="mb-8 h-16 w-auto" />
        {children}
      </main>
      <footer className="sx-legal mx-auto w-full max-w-[760px] px-6 pb-8 sm:px-8">
        A demo application page for Formly, styled after SpaceXAI&apos;s job board. Not affiliated with SpaceXAI.
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
  const box = `sx-field relative ${filled ? "formly-filled" : ""}`;
  const title = filled ? "Filled by Formly" : undefined;
  const label = (
    <span className="sx-label">
      {field.label}
      {field.required && <span className="sx-required">*</span>}
    </span>
  );

  if (field.type === "textarea") {
    const words = countWords(value);
    const over = !!field.maxWords && words > field.maxWords;
    return (
      <div>
        <label className={box} title={title}>
          {label}
          <textarea
            className="sx-control"
            rows={4}
            value={value}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        {field.maxWords && (
          <p className={`sx-count ${over ? "sx-count-over" : ""}`}>
            {words} / {field.maxWords} words
          </p>
        )}
      </div>
    );
  }

  return (
    <label className={box} title={title}>
      {label}
      {field.type === "select" ? (
        <>
          <select
            className="sx-control"
            value={value}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Select...</option>
            {field.options?.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <svg className="sx-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <polyline points="4,6 8,10 12,6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      ) : (
        <input
          className="sx-control"
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
