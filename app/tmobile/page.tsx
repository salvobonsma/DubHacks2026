"use client";

import { useMemo, useState } from "react";
import { FormlyButton, type FormlyValues } from "@/components/FormlyButton";
import schemaJson from "@/lib/schemas/tmobile.json";
import type { FormField, FormSchema } from "@/lib/types";

const schema = schemaJson as FormSchema;
const byId = new Map(schema.fields.map((f) => [f.id, f]));

/** Plan cards, one per plan option in the schema. Prices are per line with AutoPay, as on t-mobile.com. */
const PLANS: Record<string, { price: number; badge?: string; perks: string[] }> = {
  Essentials: { price: 60, badge: "Best value", perks: ["Unlimited talk, text and data", "5G access included", "Video streams in SD"] },
  Go5G: { price: 75, perks: ["Netflix Standard with ads on Us", "15GB mobile hotspot", "Talk and text in Mexico and Canada"] },
  "Go5G Plus": {
    price: 90,
    badge: "Most popular plan",
    perks: ["Upgrade your phone every 2 years", "50GB mobile hotspot", "Apple TV+ and Netflix on Us"],
  },
  "Go5G Next": {
    price: 100,
    badge: "Upgrade every year",
    perks: ["Eligible to upgrade every year", "Everything in Go5G Plus", "Price lock on talk, text and data"],
  },
};

const LINES = ["1", "2", "3", "4", "5"];

/** The plan section is drawn as cards; these fields don't also appear as plain inputs. */
const CARD_FIELDS = new Set(["plan", "lines", "port_number"]);

/** Plan first, the way T-Mobile's own checkout runs, then the rest in schema order. */
const SECTION_ORDER = ["Plan & device"];

export default function TMobileSignup() {
  const [values, setValues] = useState<FormlyValues>({});
  const [filledKeys, setFilledKeys] = useState<Set<string>>(new Set());
  const [fillCount, setFillCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const sections = useMemo(() => {
    const map = new Map<string, FormField[]>();
    for (const f of schema.fields) map.set(f.section, [...(map.get(f.section) ?? []), f]);
    return [...map.entries()].sort(
      ([a], [b]) => (SECTION_ORDER.includes(b) ? 1 : 0) - (SECTION_ORDER.includes(a) ? 1 : 0),
    );
  }, []);

  function applyFormly(incoming: FormlyValues) {
    setValues((v) => ({ ...v, ...incoming }));
    setFilledKeys(new Set(Object.keys(incoming)));
    setFillCount((c) => c + 1);
  }

  const set = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));
  const filled = (id: string) => filledKeys.has(id) && !!values[id];

  const done = schema.fields.filter((f) => values[f.id]?.trim()).length;
  const missing = schema.fields.filter((f) => f.required && !values[f.id]?.trim()).length;

  if (submitted) {
    return (
      <Shell title="You're all set">
        <div className="tm-section text-center">
          <div className="tm-check" aria-hidden>
            <svg className="icon-line" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="tm-hero">Welcome to T-Mobile, {values.first_name || "friend"}.</h1>
          <p className="tm-secondary mt-3">
            We got your order for {values.lines || 1} line{values.lines === "1" ? "" : "s"} on {values.plan || "your plan"}.
            This is a demo, so nothing was sent.
          </p>
          <button className="tm-btn tm-btn-secondary mt-6" onClick={() => location.reload()}>
            Start over
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Switch to T-Mobile">
      <div className="tm-promo px-6 py-6 text-center sm:py-8">
        <p className="tm-promo-title">Keep your number. Bring the whole family.</p>
        <p className="mt-1.5 text-[13px] text-white/85">Switching takes minutes, and we&apos;ll move your lines over for you.</p>
      </div>

      <h1 className="tm-hero mt-8">Let&apos;s get you switched.</h1>
      <p className="tm-secondary mt-2">Pick a plan, then tell us a little about you. Takes about 10 minutes, or seconds with Formly.</p>

      <div className="tm-section mt-6">
        <FormlyButton schema={schema} onFilled={applyFormly} />
        <p className="tm-secondary mt-2.5 text-center text-[13px]">
          Fields marked <span className="tm-required">*</span> are required.
        </p>
      </div>

      <form
        id="tm-signup"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing) setSubmitted(true);
        }}
        className="mt-6 space-y-6"
      >
        {sections.map(([section, fields]) =>
          section === "Plan & device" ? (
            <section key={section} className="tm-section">
              <h2 className="tm-h2">Pick your plan</h2>

              <p className="tm-label mt-5">
                How many lines?<span className="tm-required"> *</span>
              </p>
              <div
                key={`lines-${filled("lines") ? fillCount : 0}`}
                role="radiogroup"
                aria-label="Number of lines"
                className={`grid grid-cols-5 gap-2 rounded-lg ${filled("lines") ? "formly-filled" : ""}`}
              >
                {LINES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={values.lines === n}
                    onClick={() => set("lines", n)}
                    className="tm-choice tm-choice-center"
                  >
                    <span className="tm-choice-title block text-lg">{n}</span>
                    <span className="tm-choice-sub block">line{n === "1" ? "" : "s"}</span>
                  </button>
                ))}
              </div>

              <p className="tm-label mt-6">
                Choose a plan<span className="tm-required"> *</span>
              </p>
              <div
                key={`plan-${filled("plan") ? fillCount : 0}`}
                role="radiogroup"
                aria-label="Plan"
                className={`grid gap-4 rounded-2xl sm:grid-cols-2 ${filled("plan") ? "formly-filled" : ""}`}
              >
                {byId.get("plan")!.options!.map((name) => {
                  const p = PLANS[name];
                  const lines = Math.max(1, Number(values.lines) || 1);
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={values.plan === name}
                      onClick={() => set("plan", name)}
                      className="tm-plan"
                    >
                      <span className="tm-plan-head flex items-center justify-between gap-3">
                        {name}
                        <span className="tm-radio-dot" aria-hidden>
                          {values.plan === name && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                      </span>
                      <span className="flex flex-1 flex-col px-[18px] pt-4 pb-5">
                        {p?.badge && <span className="tm-badge self-start">{p.badge}</span>}
                        <span className="mt-3 flex items-baseline gap-1">
                          <span className="tm-price">${(p?.price ?? 0) * lines}</span>
                          <span className="text-sm font-semibold text-[var(--tm-text)]">/month</span>
                        </span>
                        <span className="mt-1 text-[13px] font-semibold text-[var(--tm-text)]">
                          for {lines} line{lines === 1 ? "" : "s"} with AutoPay + taxes and fees
                        </span>
                        <span className="mt-3 space-y-1.5 border-t border-[var(--tm-border)] pt-3">
                          {p?.perks.map((perk) => (
                            <span key={perk} className="tm-perk">
                              <svg className="tm-perk-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              {perk}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="tm-label mt-6">Keep your current number?</p>
              <div
                key={`port-${filled("port_number") ? fillCount : 0}`}
                role="radiogroup"
                aria-label="Keep your current number?"
                className={`grid gap-2 rounded-lg sm:grid-cols-2 ${filled("port_number") ? "formly-filled" : ""}`}
              >
                {byId.get("port_number")!.options!.map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={values.port_number === o}
                    onClick={() => set("port_number", o)}
                    className="tm-choice"
                  >
                    <span className="tm-choice-title block">{o.startsWith("Yes") ? "Keep my number" : "Get a new number"}</span>
                    <span className="tm-choice-sub block">{o.startsWith("Yes") ? "We'll transfer it from your carrier" : "Start fresh with a new one"}</span>
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {fields
                  .filter((f) => !CARD_FIELDS.has(f.id))
                  .map((f) => (
                    <Field
                      key={`${f.id}-${filledKeys.has(f.id) ? fillCount : 0}`}
                      field={f}
                      value={values[f.id] ?? ""}
                      highlight={filledKeys.has(f.id)}
                      onChange={(v) => set(f.id, v)}
                    />
                  ))}
              </div>
            </section>
          ) : (
            <section key={section} className="tm-section">
              <h2 className="tm-h2">{section}</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <Field
                    key={`${f.id}-${filledKeys.has(f.id) ? fillCount : 0}`}
                    field={f}
                    value={values[f.id] ?? ""}
                    highlight={filledKeys.has(f.id)}
                    onChange={(v) => set(f.id, v)}
                  />
                ))}
              </div>
            </section>
          ),
        )}
      </form>

      <div className="tm-sticky -mx-6 mt-8 px-6 py-3 sm:mx-0 sm:rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[var(--tm-text)]">
              <span className="tm-num">{done}</span> of <span className="tm-num">{schema.fields.length}</span> complete
              {missing > 0 && <span className="tm-secondary"> · {missing} required left</span>}
            </p>
            <div className="tm-progress mt-1.5">
              <span style={{ width: `${(done / schema.fields.length) * 100}%` }} />
            </div>
          </div>
          <button type="submit" form="tm-signup" disabled={missing > 0} className="tm-btn tm-btn-primary tm-btn-hero px-8">
            Submit
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="tm-header">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tmobile/t-mark.svg" alt="T-Mobile" width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />
          <span className="tm-checkout-title flex-1">{title}</span>
          <span className="tm-icon-btn" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="tm-icon-btn" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 5h2.5l2 11H19l2-8H6" strokeLinejoin="round" />
              <circle cx="9" cy="20" r="1.3" />
              <circle cx="17" cy="20" r="1.3" />
            </svg>
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-6">{children}</main>
      <footer className="tm-footer mt-0">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-8 text-[12px] leading-relaxed">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tmobile/t-mark.svg" alt="T-Mobile" width={32} height={32} className="h-8 w-8 object-contain" />
          <p>
            A demo signup page for Formly, styled after t-mobile.com. Not affiliated with T-Mobile. Plans and prices
            shown are for the demo only.
          </p>
          <p>T-Mobile, the T logo, Magenta and the magenta color are registered trademarks of Deutsche Telekom AG.</p>
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
