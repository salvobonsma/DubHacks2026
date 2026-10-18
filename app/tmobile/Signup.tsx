"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FormlyButton, type FormlyMeta, type FormlyValues } from "@/components/FormlyButton";
import schemaJson from "@/lib/schemas/tmobile.json";
import type { FormField, FormSchema } from "@/lib/types";
import { CHOICES_COOKIE } from "./choices";
import { TmFlowHeader, TmFooter } from "./Chrome";
import { STATE_NAMES } from "./states";

const schema = schemaJson as FormSchema;
const FIELD = Object.fromEntries(schema.fields.map((f) => [f.id, f])) as Record<string, FormField>;

/**
 * The new-customer flow as t-mobile.com runs it on a phone (plan/TMOBILE-REVERSED.md, measured on the live site):
 * Pick your plan, Name your lines, Shop phones, Your cart, then the checkout page that runs the credit check,
 * which is where the race stops. Shop phones is cut down to "bring your own phone or buy one", since the race is
 * bring-your-own. "Keep your current number?" and the current carrier aren't on the real pages before checkout as
 * far as anyone has seen (TMOBILE-REAL-FLOW.md, low confidence), so they're kept on Shop phones until Arjun's dry
 * run says where they belong.
 */
type StepId = "plan" | "names" | "phones" | "cart" | "checkout";

const STEPS: StepId[] = ["plan", "names", "phones", "cart", "checkout"];

/** The header title on each screen, verbatim from the real flow. */
const STEP_TITLE: Record<StepId, string> = {
  plan: "Pick your plan",
  names: "Name your lines",
  phones: "Shop phones",
  cart: "Your cart",
  checkout: "Checkout",
};

const STEP_FIELDS: Record<StepId, string[]> = {
  plan: ["lines", "plan"],
  names: ["line1_name"],
  phones: ["device", "port_number", "current_carrier"],
  cart: [],
  checkout: schema.fields.filter((f) => ["Personal info", "Residential address", "Consents"].includes(f.section)).map((f) => f.id),
};

/** Typed by the user on this page only: never filled, never kept in the tab's snapshot, never sent anywhere. */
const SECRET = new Set(["ssn4", "account_pin"]);

const BUY = "Buy a new phone";
const KEEP = "Yes, keep my number";
const NEW_PHONES = ["iPhone 17", "iPhone 17 Pro", "Samsung Galaxy S25", "Google Pixel 10"];

/** Demo prices: 1 line with AutoPay, and what each extra line adds. Real prices differ, so the page says so. */
const PLANS: { name: string; first: number; extra: number; badge?: string; perks: string[] }[] = [
  {
    name: "Experience Beyond 2.0",
    first: 100,
    extra: 70,
    badge: "Most value + best phone deals",
    perks: ["5-Year Price Guarantee", "Netflix Standard with ads and Hulu on us", "T-Satellite included", "250GB hotspot"],
  },
  {
    name: "Experience More 2.0",
    first: 85,
    extra: 55,
    perks: ["5-Year Price Guarantee", "Netflix Standard with ads on us", "Unlimited premium data"],
  },
  { name: "Essentials 2.0", first: 60, extra: 30, perks: ["Unlimited talk, text and data", "Our low price for Unlimited"] },
  { name: "Essentials Saver 2.0", first: 50, extra: 25, perks: ["Our lowest price for Unlimited", "Best for bringing your own phone"] },
];

const monthly = (plan: string | undefined, lines: number) => {
  const p = PLANS.find((x) => x.name === plan) ?? PLANS[1];
  return p.first + p.extra * (lines - 1);
};
/** The connection charge per line, due today. */
const CONNECT_FEE = 35;

/** Keyboards, autofill and limits as the real checkout sets them, so the phone shows the right keyboard. */
const INPUT_HINTS: Record<
  string,
  { autoComplete?: string; inputMode?: "tel" | "email" | "numeric" | "text"; maxLength?: number; type?: string }
> = {
  first_name: { autoComplete: "given-name", maxLength: 128 },
  last_name: { autoComplete: "family-name", maxLength: 128 },
  line1_name: { autoComplete: "given-name" },
  dob: { autoComplete: "off", inputMode: "numeric", maxLength: 10 },
  ssn4: { autoComplete: "off", inputMode: "numeric", maxLength: 4, type: "password" },
  phone: { autoComplete: "tel-national", inputMode: "tel", maxLength: 14, type: "tel" },
  email: { autoComplete: "email", inputMode: "email", type: "email" },
  account_pin: { autoComplete: "new-password", inputMode: "numeric", maxLength: 15, type: "password" },
  street: { autoComplete: "address-line1" },
  apt: { autoComplete: "address-line2" },
  city: { autoComplete: "address-level2" },
  zip: { autoComplete: "postal-code", inputMode: "numeric", maxLength: 5 },
};

const LABELS: Record<string, string> = {
  dob: "Date of birth (mm/dd/yyyy)",
  apt: "Apt./ Suite (Optional)",
};

const SNAPSHOT_KEY = "formly-tmobile-signup";
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

interface Snapshot {
  at: number;
  step: StepId;
  values: FormlyValues;
  formly: FormlyValues;
  suggested: string[];
  scrollY: number;
}

/** Answers Formly brought back, already approved in the Formly popup. */
export interface InitialFill {
  values: FormlyValues;
  suggested: string[];
}

function isVisible(id: string, v: FormlyValues): boolean {
  if (id === "current_carrier") return v.port_number === KEEP;
  if (id === "new_phone") return v.device === BUY;
  const n = /^line(\d)_name$/.exec(id);
  if (n) return Number(n[1]) <= Number(v.lines || 1);
  return true;
}

function isRequired(id: string): boolean {
  return !!FIELD[id]?.required || id === "current_carrier" || id === "new_phone";
}

/** What Formly can fill: everything but the SSN digits, the PIN and the consent boxes. */
const fillable = (id: string) => !FIELD[id]?.never;

function stepOf(id: string): StepId {
  if (id === "new_phone") return "phones";
  return STEPS.find((s) => STEP_FIELDS[s].includes(id)) ?? "checkout";
}

/** "2008-03-14" -> "03/14/2008"; already mm/dd/yyyy stays. */
function toMdy(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : v;
}

function formatDob(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
}

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10})/, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Valid for this field, beyond "not empty"? */
function isValid(id: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (id === "dob") return /^\d{2}\/\d{2}\/\d{4}$/.test(v);
  if (id === "phone") return v.replace(/\D/g, "").length === 10;
  if (id === "zip") return /^\d{5}$/.test(v);
  if (id === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (id === "ssn4") return /^\d{4}$/.test(v);
  if (id === "account_pin") return /^\d{6,15}$/.test(v);
  return true;
}

/** Required fields still missing on a step (or the whole flow). `all` adds what only the user can give. */
function missingFields(v: FormlyValues, ids: string[], all = false): string[] {
  return ids.filter((id) => (all || fillable(id)) && isVisible(id, v) && isRequired(id) && !isValid(id, v[id] ?? ""));
}

const allIds = () => [...STEPS.flatMap((s) => STEP_FIELDS[s]), "new_phone"];

/** Keep only answers this form can take: known fields Formly may fill, select values that are real options. */
function cleanIncoming(incoming: FormlyValues): FormlyValues {
  const out: FormlyValues = {};
  for (const [id, raw] of Object.entries(incoming)) {
    const f = FIELD[id];
    if (!f || f.never || SECRET.has(id) || typeof raw !== "string" || !raw.trim()) continue;
    let value = raw.trim();
    if (f.options) {
      const match = f.options.find((o) => o.toLowerCase() === value.toLowerCase());
      if (!match) continue;
      value = match;
    }
    if (id === "dob") value = toMdy(value);
    if (id === "phone") value = formatPhone(value);
    out[id] = value;
  }
  return out;
}

/** The step a fill lands on, and the field to put the cursor in: the first one Formly couldn't fill. */
function landing(v: FormlyValues): { focus: string | null } {
  const missing = missingFields(v, allIds());
  return { focus: missing.find((id) => stepOf(id) === "checkout") ?? null };
}

/**
 * Formly's suggestions never replace a choice the user already made on this page: pick 2 lines, tap Fill, and it
 * stays 2 lines. A value that only an earlier Formly fill put there may be replaced. Facts from the data still win.
 */
function keepUserChoices(fill: FormlyValues, suggested: string[], before: FormlyValues, beforeFormly: FormlyValues): FormlyValues {
  const out = { ...fill };
  for (const id of suggested) {
    const mine = before[id]?.trim();
    if (mine && before[id] !== beforeFormly[id]) delete out[id];
  }
  return out;
}

function readSnapshot(): Snapshot | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY) ?? "null") as Snapshot | null;
    return s && Date.now() - s.at < SNAPSHOT_TTL_MS ? s : null;
  } catch {
    return null;
  }
}

/** Fields Formly may only suggest (lines, plan, phone, number…): the ones a user's own choice must win on. */
const CHOICE_IDS = schema.fields.filter((f) => f.suggest).map((f) => f.id);

/** Kept per tab so the Formly round trip, a reload or back-navigation lands on the same step. No secrets or consents. */
function writeSnapshot(s: Omit<Snapshot, "at">) {
  try {
    const values = Object.fromEntries(Object.entries(s.values).filter(([id]) => !SECRET.has(id) && !FIELD[id]?.never));
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...s, values, at: Date.now() }));
    const mine = Object.fromEntries(CHOICE_IDS.filter((id) => values[id] && values[id] !== s.formly[id]).map((id) => [id, values[id]]));
    document.cookie = `${CHOICES_COOKIE}=${encodeURIComponent(JSON.stringify(mine))}; path=/tmobile; max-age=1800; samesite=lax`;
  } catch {}
}

function clearSnapshot() {
  try {
    sessionStorage.removeItem(SNAPSHOT_KEY);
    document.cookie = `${CHOICES_COOKIE}=; path=/tmobile; max-age=0; samesite=lax`;
  } catch {}
}

export function Signup({
  race,
  returning: returningAtLoad,
  initial,
  mine = null,
}: {
  race: boolean;
  returning: boolean;
  /** Read on the server for a same-tab return, so the first paint already has the answers. */
  initial: InitialFill | null;
  /** The choices the user made here before leaving (from the choices cookie), so a suggestion can't replace them. */
  mine?: FormlyValues | null;
}) {
  const own = mine ? cleanIncoming(mine) : {};
  const first = initial ? keepUserChoices(cleanIncoming(initial.values), initial.suggested, own, {}) : null;
  const [values, setValues] = useState<FormlyValues>(first ? { ...own, ...first } : {});
  /** What Formly filled, so a field keeps its mark only while it still holds that answer. */
  const [formly, setFormly] = useState<FormlyValues>(first ?? {});
  /** Of those, the ones that were Formly's suggestions rather than facts from the user's data. */
  const [suggested, setSuggested] = useState<string[]>(first ? (initial?.suggested ?? []).filter((id) => id in first) : []);
  const [step, setStep] = useState<StepId>(first && Object.keys(first).length ? "checkout" : "plan");
  const [returning, setReturning] = useState(returningAtLoad && !first);
  const [showErrors, setShowErrors] = useState(false);
  const [raceResult, setRaceResult] = useState<"sending" | "recorded" | "not-running" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const restored = useRef(false);
  const pendingScroll = useRef<number | null>(null);
  const pendingFocus = useRef<string | null>(null);

  const stepIndex = STEPS.indexOf(step);
  const marked = (id: string) => !!formly[id] && values[id] === formly[id] && isVisible(id, values);
  const filledByFormly = Object.keys(formly).filter(marked);
  const lines = Number(values.lines || 1);

  function goTo(next: StepId, focus?: string) {
    setStep(next);
    setShowErrors(false);
    pendingFocus.current = focus ?? null;
    pendingScroll.current = 0;
  }

  function applyFormly(incoming: FormlyValues, meta?: FormlyMeta, before = values, beforeFormly = formly) {
    const all = cleanIncoming(incoming);
    if (!Object.keys(all).length) return;
    const clean = keepUserChoices(all, meta?.suggested ?? [], before, beforeFormly);
    const merged = { ...before, ...clean };
    setValues(merged);
    setFormly(clean);
    setSuggested((meta?.suggested ?? []).filter((id) => id in clean));
    // Everything is filled at once: land on the checkout page, on the first field Formly couldn't fill.
    goTo("checkout", landing(merged).focus ?? undefined);
  }

  // Before first paint: put back the step, answers and scroll from before the Formly round trip (or a reload).
  // A same-tab return already has its answers from the server (initial); otherwise collect them here.
  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const snap = readSnapshot();
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("formly_session");
    if (sessionId) {
      url.searchParams.delete("formly_session");
      window.history.replaceState(null, "", url);
    }
    // Syncing from browser storage on mount; there's no render-time source for it (SSR has no sessionStorage).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (first) {
      const fill = snap ? keepUserChoices(first, initial?.suggested ?? [], snap.values, snap.formly) : first;
      if (snap) {
        setValues({ ...snap.values, ...fill });
        setFormly(fill);
        setSuggested((initial?.suggested ?? []).filter((id) => id in fill));
      }
      pendingFocus.current = landing({ ...(snap?.values ?? {}), ...fill }).focus;
      return;
    }
    if (snap) {
      setValues(snap.values);
      setFormly(snap.formly);
      setSuggested(snap.suggested ?? []);
      setStep(snap.step);
      if (!sessionId) pendingScroll.current = snap.scrollY;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!sessionId) return;
    fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { values?: FormlyValues | null; suggested?: string[] } | null) => {
        if (s?.values) applyFormly(s.values, { suggested: s.suggested ?? [] }, snap?.values ?? {}, snap?.formly ?? {});
        else if (snap) pendingScroll.current = snap.scrollY;
      })
      .catch(() => undefined)
      .finally(() => setReturning(false));
    // Runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll and focus after the step has rendered.
  useLayoutEffect(() => {
    if (returning) return;
    if (pendingScroll.current !== null) {
      window.scrollTo({ top: pendingScroll.current });
      pendingScroll.current = null;
    }
    if (pendingFocus.current) {
      const el = document.getElementById(`f-${pendingFocus.current}`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  });

  useEffect(() => {
    if (!restored.current || returning || submitted || raceResult) return;
    writeSnapshot({ step, values, formly, suggested, scrollY: window.scrollY });
  }, [step, values, formly, suggested, returning, submitted, raceResult]);

  // Leaving for the same-tab Formly flow (or any navigation): keep the exact scroll position too.
  useEffect(() => {
    const save = () => {
      if (restored.current && !submitted && !raceResult) writeSnapshot({ step, values, formly, suggested, scrollY: window.scrollY });
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [step, values, formly, suggested, submitted, raceResult]);

  const set = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));

  function next() {
    const ids = step === "names" ? [] : step === "phones" ? [...STEP_FIELDS.phones, "new_phone"] : STEP_FIELDS[step];
    const missing = missingFields(values, ids, step === "checkout" && !race);
    if (missing.length) {
      setShowErrors(true);
      const el = document.getElementById(`f-${missing[0]}`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    if (step === "checkout") return race ? finishRace() : submit();
    goTo(STEPS[stepIndex + 1]);
  }

  function back() {
    if (stepIndex > 0) goTo(STEPS[stepIndex - 1]);
  }

  /**
   * The race stops here: everything Formly can fill is on the checkout page and the judge would now type the SSN
   * digits and a PIN and tick the consents, which run the credit check. Nothing past this is sent.
   */
  function finishRace() {
    const shown = allIds().filter((id) => fillable(id) && isVisible(id, values) && !!FIELD[id]);
    const fields = shown.filter(marked).length;
    const typed = shown.filter((id) => values[id]?.trim() && !marked(id)).length;
    setRaceResult("sending");
    clearSnapshot();
    setValues((v) => Object.fromEntries(Object.entries(v).filter(([id]) => !SECRET.has(id))));
    window.scrollTo({ top: 0 });
    fetch("/api/race", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields, total: shown.length, typed }),
    })
      .then((r) => r.json())
      .then((r: { recorded?: boolean }) => setRaceResult(r.recorded ? "recorded" : "not-running"))
      .catch(() => setRaceResult("not-running"));
  }

  function submit() {
    setValues((v) => Object.fromEntries(Object.entries(v).filter(([id]) => !SECRET.has(id))));
    clearSnapshot();
    setSubmitted(true);
    window.scrollTo({ top: 0 });
  }

  function startOver() {
    clearSnapshot();
    setValues({});
    setFormly({});
    setSuggested([]);
    setRaceResult(null);
    setSubmitted(false);
    goTo("plan");
  }

  const cart = values.plan ? lines : 0;

  if (returning) {
    return (
      <Frame title="Checkout" progress={1} cart={cart}>
        <div className="flex flex-col items-center py-24 text-center" role="status">
          <div className="tm-spinner" aria-hidden />
          <p className="tm-h2 mt-6">Returning to T-Mobile</p>
          <p className="tm-caption mt-2">Adding your answers to your signup.</p>
        </div>
      </Frame>
    );
  }

  if (submitted || raceResult) {
    return (
      <Frame title="Checkout" progress={1} cart={cart}>
        <div className="py-12 text-center" role="status">
          <div className="tm-check mx-auto" aria-hidden>
            <CheckIcon size={28} />
          </div>
          {raceResult ? (
            <>
              <h1 className="tm-h1 mt-6">Race finished, we stop before the credit check</h1>
              <p className="tm-caption mx-auto mt-3 max-w-sm">
                {raceResult === "sending"
                  ? "Stopping the clock…"
                  : raceResult === "recorded"
                    ? `Your time is on the race screen. Formly filled ${filledByFormly.length} fields. No Social Security number, PIN or consent was asked for or sent.`
                    : "The race clock wasn't running, so no time was recorded. No Social Security number, PIN or consent was asked for or sent."}
              </p>
            </>
          ) : (
            <>
              <h1 className="tm-h1 mt-6">Application submitted.</h1>
              <p className="tm-caption mt-3">We&apos;ll email {values.email || "you"} within one business day.</p>
            </>
          )}
          {raceResult !== "sending" && (
            <button className="tm-btn tm-btn-secondary mt-8" onClick={startOver}>
              Start over
            </button>
          )}
        </div>
      </Frame>
    );
  }

  const fieldProps = (id: string) => ({
    field: FIELD[id],
    value: values[id] ?? "",
    mark: marked(id) ? (suggested.includes(id) ? ("suggested" as const) : ("filled" as const)) : null,
    error: showErrors && isRequired(id) && isVisible(id, values) && !isValid(id, values[id] ?? "") && (fillable(id) || !race),
    onChange: (v: string) => set(id, v),
  });

  const total = monthly(values.plan, lines);
  // In the race T-Mobile asks for the carrier itself later (spec section 6), so it isn't listed as missing.
  const missingForFormly = filledByFormly.length
    ? missingFields(values, allIds()).filter((id) => !(race && id === "current_carrier"))
    : [];
  const userOnly = schema.fields.filter((f) => f.never).map((f) => f.label);
  const stepErrors = showErrors && missingFields(values, STEP_FIELDS[step], step === "checkout" && !race).length > 0;

  return (
    <Frame title={STEP_TITLE[step]} progress={(stepIndex + 1) / STEPS.length} cart={cart} gray={step !== "checkout"}>
      {stepIndex > 0 && (
        <button type="button" onClick={back} className="tm-btn tm-btn-tertiary -ml-1 min-h-11 self-start py-0 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      )}

      {step === "plan" && (
        <section className="mt-2">
          <FormlyButton schema={schema} onFilled={applyFormly} />
          <h1 className="tm-h1 mt-6">Compare our best unlimited cell phone plans.</h1>
          <p className="tm-caption mt-2">However you want to stay connected, there&apos;s a plan with the benefits for it.</p>

          <div className="mt-6">
            <LineTiles {...fieldProps("lines")} plan={values.plan} />
          </div>
          <div className="mt-6">
            <PlanCards {...fieldProps("plan")} lines={lines} />
          </div>
          <p className="tm-legal mt-6">Demo prices with AutoPay. Taxes and fees extra. Check t-mobile.com for current pricing.</p>
        </section>
      )}

      {step === "names" && (
        <section className="mt-2">
          <h1 className="tm-h1">Who are you shopping for?</h1>
          <p className="tm-caption mt-2">Name each line so it&apos;s easy to tell them apart. You can change names later.</p>
          <div className="mt-6 space-y-4">
            {Array.from({ length: lines }, (_, i) => {
              const id = `line${i + 1}_name`;
              return FIELD[id] ? (
                <TextField key={id} {...fieldProps(id)} />
              ) : (
                <TextField
                  key={id}
                  field={{ id, label: `Line ${i + 1} name`, type: "text", section: "Name your lines", category: "basic" }}
                  value={values[id] ?? ""}
                  mark={null}
                  error={false}
                  onChange={(v) => set(id, v)}
                />
              );
            })}
          </div>
        </section>
      )}

      {step === "phones" && (
        <section className="mt-2">
          <h1 className="tm-h1">Choose a phone for each line</h1>
          <p className="tm-caption mt-2">Bring the phone you have, or get a new one.</p>
          <div className="mt-6 space-y-6">
            <Choice
              {...fieldProps("device")}
              details={{
                "Bring your own phone": "Keep the phone you love. We'll send a SIM or set up eSIM.",
                "Buy a new phone": "Get a new phone. Pay nothing upfront with eligible credit.",
              }}
            />
            {isVisible("new_phone", values) && (
              <SelectField
                field={{ id: "new_phone", label: "Phone", type: "select", section: "Shop phones", category: "basic", options: NEW_PHONES }}
                value={values.new_phone ?? ""}
                mark={null}
                error={showErrors && !values.new_phone}
                onChange={(v) => set("new_phone", v)}
              />
            )}
            <Choice {...fieldProps("port_number")} />
            {isVisible("current_carrier", values) && <SelectField {...fieldProps("current_carrier")} />}
          </div>
        </section>
      )}

      {step === "cart" && (
        <section className="mt-2">
          <h1 className="tm-h1">Your cart</h1>
          <div className="tm-card mt-6 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="tm-caption">Due monthly</p>
                <p className="tm-num text-2xl">${total.toFixed(2)}</p>
              </div>
              <div>
                <p className="tm-caption">Due today</p>
                <p className="tm-num text-2xl">${(CONNECT_FEE * lines).toFixed(2)}</p>
              </div>
            </div>
            <p className="tm-legal mt-2">Plus taxes and fees. Due today is a ${CONNECT_FEE} connection charge per line.</p>
          </div>
          <div className="tm-card mt-4 p-4">
            <OrderSummary values={values} onEdit={(s) => goTo(s)} marked={marked} suggested={suggested} />
          </div>
          <p className="tm-notice mt-4">Add your personal info to see your exact payments and taxes.</p>
        </section>
      )}

      {step === "checkout" && (
        <section>
          <button
            type="button"
            onClick={() => setCartOpen((o) => !o)}
            aria-expanded={cartOpen}
            className="tm-notice flex min-h-11 w-full items-center justify-between text-left"
          >
            <span>
              <span className="font-semibold">Cart summary</span>
              <span className="tm-secondary"> · ${total.toFixed(2)}/mo + taxes & fees · ${(CONNECT_FEE * lines).toFixed(2)} due today</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={cartOpen ? "rotate-180" : ""}>
              <path d="M5 9l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {cartOpen && (
            <div className="tm-card mt-2 p-4">
              <OrderSummary values={values} onEdit={(s) => goTo(s)} marked={marked} suggested={suggested} />
            </div>
          )}

          <h1 className="tm-h1 mt-6">Get your exact pricing with a quick credit check</h1>
          <p className="tm-caption mt-2">Don&apos;t worry, this won&apos;t affect your credit score.</p>

          {filledByFormly.length > 0 && (
            <div className="tm-card mt-6 p-4">
              <p className="flex items-start gap-2 text-base font-semibold text-[var(--tm-text)]">
                <span className="mt-0.5 flex-none text-[var(--tm-magenta-400)]">
                  <CheckIcon size={18} />
                </span>
                <span>
                  Formly filled <span className="tm-num">{filledByFormly.length}</span> field
                  {filledByFormly.length === 1 ? "" : "s"}
                  {suggested.some(marked) ? `, ${suggested.filter(marked).length} of them suggestions` : ""}
                </span>
              </p>
              {missingForFormly.length > 0 && (
                <div className="mt-3">
                  <p className="tm-caption">Formly couldn&apos;t fill these. Tap one to add it:</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {missingForFormly.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          className="tm-chip"
                          onClick={() => {
                            if (stepOf(id) !== "checkout") return goTo(stepOf(id), id);
                            const el = document.getElementById(`f-${id}`);
                            el?.scrollIntoView({ block: "center" });
                            el?.focus({ preventScroll: true });
                          }}
                        >
                          {FIELD[id]?.label ?? "Phone"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="tm-legal mt-3">
                {race ? "The race stops before these, so leave them: " : "You add these yourself: "}
                {userOnly.slice(0, -1).join(", ")} and {userOnly.at(-1)}.
              </p>
            </div>
          )}

          <fieldset className="mt-6 space-y-4">
            <legend className="sr-only">Personal info</legend>
            <TextField {...fieldProps("first_name")} />
            <TextField {...fieldProps("last_name")} />
            <TextField {...fieldProps("dob")} format={formatDob} />
            <SecretField {...fieldProps("ssn4")} disabled={race} />
            <TextField {...fieldProps("phone")} format={formatPhone} />
            <TextField {...fieldProps("email")} help="Email will be used to create your T-Mobile account." />
          </fieldset>

          <fieldset className="mt-8">
            <legend className="tm-h3">Create an account PIN</legend>
            <p className="tm-help">You&apos;ll use this PIN to confirm it&apos;s you when you contact us. Pick one you&apos;ll remember.</p>
            <div className="mt-4">
              <SecretField {...fieldProps("account_pin")} disabled={race} help="Enter 6–15 digits, numbers only." />
            </div>
          </fieldset>

          <fieldset className="mt-8 space-y-4">
            <legend className="tm-h3">Residential address</legend>
            <p className="tm-help -mt-2">
              This is your primary place of use, and it may be shared with emergency services if you dial 911.
            </p>
            <TextField {...fieldProps("street")} />
            <TextField {...fieldProps("apt")} />
            <TextField {...fieldProps("city")} />
            <div className="grid grid-cols-2 gap-4">
              <SelectField {...fieldProps("state")} names={STATE_NAMES} />
              <TextField {...fieldProps("zip")} format={(v) => v.replace(/\D/g, "").slice(0, 5)} />
            </div>
            <CheckRow {...fieldProps("delivery_same")} text="Use as delivery address" />
          </fieldset>

          <fieldset className="mt-6 border-t border-[var(--tm-border)] pt-2">
            <legend className="sr-only">Consents</legend>
            <CheckRow
              {...fieldProps("esign_consent")}
              disabled={race}
              text="E-SIGN Consent: By checking this box, I agree that I have read and consent to T-Mobile's Consent to Use Electronic Records and Signatures Disclosure."
            />
            <CheckRow
              {...fieldProps("credit_consent")}
              disabled={race}
              text="By checking this box, I agree that T-Mobile, or others acting for it, may get my credit report to check my eligibility."
            />
          </fieldset>
        </section>
      )}

      <div className="tm-actionbar">
        {stepErrors && (
          <p className="tm-error mb-2" role="alert">
            Fill in the highlighted fields to continue.
          </p>
        )}
        {step === "names" ? (
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => goTo("phones")} className="tm-btn tm-btn-tertiary flex-none">
              Not now ›
            </button>
            <button
              type="button"
              onClick={() => goTo("phones")}
              disabled={!Array.from({ length: lines }, (_, i) => values[`line${i + 1}_name`]?.trim()).some(Boolean)}
              className="tm-btn tm-btn-primary flex-1"
            >
              Add names
            </button>
          </div>
        ) : step === "checkout" ? (
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => goTo("cart")} className="tm-btn tm-btn-tertiary flex-none">
              Return to cart ›
            </button>
            <button
              type="button"
              onClick={next}
              aria-disabled={missingFields(values, STEP_FIELDS.checkout, !race).length > 0 || undefined}
              className="tm-btn tm-btn-primary flex-1"
            >
              {race ? "Continue to credit check" : "Accept & continue"}
            </button>
          </div>
        ) : (
          <button type="button" onClick={next} className="tm-btn tm-btn-primary w-full">
            {step === "cart" ? "Check out" : "Continue"}
          </button>
        )}
      </div>
    </Frame>
  );
}

/** The static shell while the page reads its URL: the T-Mobile frame with a spinner, never an empty form. */
export function SignupPending() {
  return (
    <Frame title="Pick your plan" progress={0.2} cart={0} gray>
      <div className="flex justify-center py-24" role="status" aria-label="Loading">
        <div className="tm-spinner" aria-hidden />
      </div>
    </Frame>
  );
}

function Frame({
  title,
  progress,
  cart,
  gray = false,
  children,
}: {
  title: string;
  progress: number;
  cart: number;
  gray?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-1 flex-col ${gray ? "tm-page-gray" : ""}`}>
      <TmFlowHeader title={title} progress={progress} cart={cart} />
      <main className="tm-main mx-auto w-full max-w-xl flex-1 px-4 pt-3 pb-8">{children}</main>
      <TmFooter />
    </div>
  );
}

function OrderSummary({
  values,
  onEdit,
  marked,
  suggested,
}: {
  values: FormlyValues;
  onEdit: (s: StepId) => void;
  marked: (id: string) => boolean;
  suggested: string[];
}) {
  const lines = Number(values.lines || 1);
  const rows: [StepId, string, string | undefined, string[]][] = [
    ["plan", "Plan", values.plan ? `${values.plan}, ${lines} line${lines === 1 ? "" : "s"}` : undefined, ["plan", "lines"]],
    [
      "phones",
      "Phone",
      values.device ? (values.device === BUY && values.new_phone ? values.new_phone : values.device) : undefined,
      ["device"],
    ],
    [
      "phones",
      "Number",
      values.port_number
        ? values.port_number === KEEP && values.current_carrier
          ? `Keep my number from ${values.current_carrier}`
          : values.port_number
        : undefined,
      ["port_number", "current_carrier"],
    ],
  ];
  return (
    <dl className="divide-y divide-[var(--tm-border)]">
      {rows.map(([s, label, text, ids]) => (
        <div key={label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <dt className="tm-caption w-16 flex-none">{label}</dt>
          <dd className="min-w-0 flex-1 text-sm leading-5">
            {text ?? <span className="tm-secondary">Not chosen yet</span>}
            {ids.some(marked) && (
              <Mark kind={ids.filter(marked).every((id) => suggested.includes(id)) ? "suggested" : "filled"} />
            )}
          </dd>
          <button type="button" className="tm-link -my-3 min-h-11 flex-none text-sm" onClick={() => onEdit(s)}>
            Edit
          </button>
        </div>
      ))}
    </dl>
  );
}

interface FieldProps {
  field: FormField;
  value: string;
  /** Formly's answer, and whether it was a fact from the user's data or a suggestion. */
  mark: "filled" | "suggested" | null;
  error: boolean;
  onChange: (v: string) => void;
}

function Mark({ kind }: { kind: "filled" | "suggested" }) {
  return (
    <span className="tm-filled">
      <CheckIcon size={14} />
      {kind === "suggested" ? "Suggested by Formly" : "Filled by Formly"}
    </span>
  );
}

function FieldFoot({ mark, error, help }: { mark: FieldProps["mark"]; error: boolean; help?: string }) {
  if (error) return <p className="tm-error">Required</p>;
  return (
    <>
      {help && <p className="tm-help">{help}</p>}
      {mark && <Mark kind={mark} />}
    </>
  );
}

function TextField({
  field,
  value,
  mark,
  error,
  onChange,
  help,
  format,
}: FieldProps & { help?: string; format?: (v: string) => string }) {
  const h = INPUT_HINTS[field.id] ?? {};
  return (
    <div>
      <div className="tm-float">
        <input
          id={`f-${field.id}`}
          name={field.id}
          className="tm-input"
          type={h.type ?? "text"}
          value={value}
          placeholder=" "
          autoComplete={h.autoComplete}
          inputMode={h.inputMode}
          maxLength={h.maxLength}
          aria-invalid={error || undefined}
          onChange={(e) => onChange(format ? format(e.target.value) : e.target.value)}
        />
        <label htmlFor={`f-${field.id}`}>{LABELS[field.id] ?? field.label}</label>
      </div>
      <FieldFoot mark={mark} error={error} help={help} />
    </div>
  );
}

/** SSN digits and the PIN: masked with an eye toggle, typed here only. Disabled in the race, which stops first. */
function SecretField({ field, value, error, onChange, help, disabled }: FieldProps & { help?: string; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  const h = INPUT_HINTS[field.id] ?? {};
  // Race mode: the judge stops before secrets, so show a settled read-only row, not a broken-looking empty input.
  if (disabled) {
    return (
      <div>
        <div className="tm-skipped" id={`f-${field.id}`} role="group" aria-label={`${field.label}, skipped in the race`}>
          <span className="tm-skipped-label">{field.label}</span>
          <span className="tm-skipped-value">Skipped in the race</span>
          <svg className="tm-skipped-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        </div>
        <p className="tm-help">You&apos;d set this on t-mobile.com. Both judges skip it.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="tm-float">
        <input
          id={`f-${field.id}`}
          name={field.id}
          className="tm-input pr-14"
          type={show ? "text" : "password"}
          value={value}
          placeholder=" "
          autoComplete={h.autoComplete}
          inputMode={h.inputMode}
          maxLength={h.maxLength}
          aria-invalid={error || undefined}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        />
        <label htmlFor={`f-${field.id}`}>{field.label}</label>
        <button type="button" className="tm-float-action" aria-label={show ? `Hide ${field.label}` : `Show ${field.label}`} onClick={() => setShow((s) => !s)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
            {show && <path d="M4 4l16 16" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
      <FieldFoot mark={null} error={error} help={help} />
    </div>
  );
}

function SelectField({ field, value, mark, error, onChange, names }: FieldProps & { names?: Record<string, string> }) {
  return (
    <div>
      <div className="tm-float" data-filled="true">
        <select
          id={`f-${field.id}`}
          name={field.id}
          className="tm-input"
          value={value}
          autoComplete={field.id === "state" ? "address-level1" : undefined}
          aria-invalid={error || undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {field.id === "state" ? o : (names?.[o] ?? o)}
            </option>
          ))}
        </select>
        <label htmlFor={`f-${field.id}`}>{field.label}</label>
      </div>
      <FieldFoot mark={mark} error={error} />
    </div>
  );
}

/** A Yes / No field shown as the real page's checkbox ("Use as delivery address", the consents). */
function CheckRow({ field, value, mark, error, onChange, text, disabled }: FieldProps & { text: string; disabled?: boolean }) {
  return (
    <div>
      <label className={`tm-checkrow ${disabled ? "opacity-60" : ""}`}>
        <input
          id={`f-${field.id}`}
          type="checkbox"
          checked={value === "Yes"}
          disabled={disabled}
          aria-invalid={error || undefined}
          onChange={(e) => onChange(e.target.checked ? "Yes" : field.options?.includes("No") ? "No" : "")}
        />
        <span>{text}</span>
      </label>
      <FieldFoot mark={mark} error={error} />
    </div>
  );
}

/** A select field shown as tappable cards, the way the real flow asks one-of-two questions. */
function Choice({ field, value, mark, error, onChange, details }: FieldProps & { details?: Record<string, string> }) {
  return (
    <div role="radiogroup" aria-labelledby={`l-${field.id}`}>
      <p className="tm-h3" id={`l-${field.id}`}>
        {field.label}
      </p>
      {mark && !error && <Mark kind={mark} />}
      <div className="mt-3 grid gap-3">
        {field.options?.map((o, i) => (
          <button
            key={o}
            id={i === 0 ? `f-${field.id}` : undefined}
            type="button"
            role="radio"
            aria-checked={value === o}
            className={`tm-option ${error ? "tm-option-error" : ""}`}
            onClick={() => onChange(o)}
          >
            <span className="text-base leading-[22px] font-semibold text-[var(--tm-text)]">{o}</span>
            {details?.[o] && <span className="tm-caption mt-1">{details[o]}</span>}
          </button>
        ))}
      </div>
      <FieldFoot mark={null} error={error} />
    </div>
  );
}

function LineTiles({ field, value, mark, error, onChange, plan }: FieldProps & { plan?: string }) {
  return (
    <div role="radiogroup" aria-labelledby="l-lines">
      <p className="tm-h3" id="l-lines">
        How many lines do you need?
      </p>
      <div className="tm-tiles mt-3">
        {field.options?.map((o, i) => {
          const n = Number(o);
          return (
            <button
              key={o}
              id={i === 0 ? "f-lines" : undefined}
              type="button"
              role="radio"
              aria-checked={value === o}
              className="tm-tile"
              style={error ? { borderColor: "var(--tm-critical-300)" } : undefined}
              onClick={() => onChange(o)}
            >
              <span className="block text-base leading-[22px] font-bold">
                {o} line{n === 1 ? "" : "s"}
              </span>
              <span className="tm-legal block">Average price per line ${(monthly(plan, n) / n).toFixed(2)}</span>
            </button>
          );
        })}
      </div>
      <FieldFoot mark={mark} error={error} />
    </div>
  );
}

function PlanCards({ field, value, mark, error, onChange, lines }: FieldProps & { lines: number }) {
  return (
    <div role="radiogroup" aria-labelledby="l-plan">
      <p className="tm-h3" id="l-plan">
        Choose your plan
      </p>
      <div className="mt-3 space-y-4">
        {PLANS.filter((p) => field.options?.includes(p.name)).map((p, i) => {
          const selected = value === p.name;
          return (
            <div key={p.name} className={`tm-plan ${error ? "tm-plan-error" : ""}`}>
              <p className="tm-plan-head">{p.name}</p>
              <div className="p-4">
                {p.badge && <span className="tm-plan-badge">{p.badge}</span>}
                <p className="mt-2">
                  <span className="tm-num text-[32px] leading-10">${monthly(p.name, lines)}</span>
                  <span className="text-base font-semibold text-[var(--tm-text)]">/month</span>
                </p>
                <p className="tm-caption">
                  for {lines} phone line{lines === 1 ? "" : "s"} + taxes and fees
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--tm-positive-300)]">
                  <CheckIcon size={16} />
                  <span className="text-[var(--tm-text-body)]">AutoPay discount applied</span>
                </p>
                <ul className="mt-3 space-y-1 text-sm leading-5">
                  {p.perks.map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <span className="mt-0.5 flex-none text-[var(--tm-magenta-400)]">
                        <CheckIcon size={14} />
                      </span>
                      {perk}
                    </li>
                  ))}
                </ul>
                <button
                  id={i === 0 ? "f-plan" : undefined}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${p.name}${selected ? ", selected" : ""}`}
                  onClick={() => onChange(p.name)}
                  className={`tm-btn mt-4 w-full ${selected ? "tm-btn-tertiary text-[var(--tm-gray-500)]" : "tm-btn-secondary"}`}
                >
                  {selected ? "✓ Selected" : "Select"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <FieldFoot mark={mark} error={error} />
    </div>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
