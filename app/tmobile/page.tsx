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

  if (submitted) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-magenta text-2xl text-white">✓</div>
          <h1 className="text-2xl font-bold">Welcome to T-Mobile, {values.first_name || "friend"}!</h1>
          <p className="mt-2 text-muted">Your application has been received.</p>
          <button className="mt-6 text-sm font-semibold text-magenta underline" onClick={() => location.reload()}>
            Start over
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          {schema.title} · {done}/{schema.fields.length} fields complete
        </p>

        <div className="mt-6">
          <FormlyButton schema={schema} onFilled={applyFormly} />
        </div>
        <div className="my-6 flex items-center gap-3 text-sm text-muted">
          <div className="h-px flex-1 bg-line" />
          or fill in manually
          <div className="h-px flex-1 bg-line" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          className="space-y-8"
        >
          {sections.map(([section, fields]) => (
            <fieldset key={section}>
              <legend className="mb-3 text-sm font-bold uppercase tracking-wide text-magenta">{section}</legend>
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
          <button
            type="submit"
            className="w-full rounded-xl bg-magenta px-5 py-3.5 font-semibold text-white hover:brightness-110"
          >
            Continue to review
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f6f6]">
      <header className="bg-magenta">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 text-white">
          <span className="text-3xl font-black leading-none">T</span>
          <span className="text-lg font-semibold">T-Mobile</span>
          <span className="ml-auto text-sm opacity-80">Secure checkout</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
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
  const cls = `w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-magenta focus:ring-2 focus:ring-magenta/20 ${
    highlight && value ? "formly-filled" : ""
  }`;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {field.label}
        {field.required && <span className="text-magenta"> *</span>}
      </span>
      {field.type === "select" ? (
        <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          className={cls}
          type={field.type}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
