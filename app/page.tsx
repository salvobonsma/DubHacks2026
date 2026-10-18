import type { Metadata } from "next";
import Link from "next/link";
import { FormlyHeader } from "@/components/FormlyHeader";
import { ArrowRightIcon, CheckIcon } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import { AddressTypewriter } from "@/components/landing/AddressTypewriter";
import { AutofillGrid } from "@/components/landing/AutofillGrid";
import { HeroMock } from "@/components/landing/HeroMock";

export const metadata: Metadata = {
  title: "Formly: fill any form in one tap",
  description:
    "A business adds one button. You connect your data once. They get only the answers you approve.",
};

const REPO = "https://github.com/salvobonsma/DubHacks2026";

/** The Formly deck as a page: what it is, why it matters, why it's safe, then the demo. Spec: deck/LANDING-PAGE-SPEC.md. */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-navy">
      <FormlyHeader />
      <main className="flex-1">
        <Hero />
        <Retyping />
        <LosePeople />
        <AutofillGap />
        <AnswersExist />
        <HowItFills />
        <AnswersNotAccounts />
        <ForBusinesses />
        <Comparison />
        <Everywhere />
        <Race />
        <Built />
      </main>
      <Footer />
    </div>
  );
}

/* ---------- Layout helpers ---------- */

function Section({
  tone,
  label,
  children,
  divided = false,
}: {
  tone: "ink" | "paper";
  label: string;
  children: React.ReactNode;
  /** A hairline on top, for a Paper section that follows another Paper section. */
  divided?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className={`${tone === "ink" ? "bg-navy text-white" : "bg-paper text-navy"} ${divided ? "border-t border-mist" : ""}`}
    >
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">{children}</div>
    </section>
  );
}

function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-[28px] leading-[1.2] tracking-[-0.01em] ${className}`}>{children}</h2>;
}

function Source({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <p className={`text-[13px] leading-snug ${dark ? "text-white/60" : "text-slate"}`}>{children}</p>;
}

/** Brand button: Sora SemiBold, 12px radius. `size="lg"` is the 52px CTA. */
function ButtonLink({
  href,
  children,
  variant,
  size = "md",
}: {
  href: string;
  children: React.ReactNode;
  variant: "ink" | "white" | "outline-light";
  size?: "md" | "lg";
}) {
  const look = {
    ink: "bg-navy text-white hover:bg-black",
    white: "bg-white text-navy hover:bg-white/85",
    "outline-light": "border border-white/30 text-white hover:bg-white/10",
  }[variant];
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 font-display text-[16px] font-semibold tracking-[-0.01em] transition-colors ${
        size === "lg" ? "h-[52px]" : "h-11"
      } ${look}`}
    >
      {children}
    </Link>
  );
}

/* ---------- 1. Hero ---------- */

function Hero() {
  return (
    <section aria-label="Formly" className="bg-navy text-white">
      <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 pt-10 pb-16 sm:pt-16 sm:pb-24 lg:grid-cols-[1fr_400px]">
        <div>
          <p className="text-[13px] font-medium text-white/70">Stripe for forms</p>
          <h1 className="mt-3 text-[36px] leading-[1.1] tracking-[-0.02em] sm:text-[48px]">
            Fill any form in one tap.
          </h1>
          <p className="mt-4 max-w-md text-[16px] leading-[1.5] text-white/80">
            A business adds one button. You connect your data once. They get only the answers you approve.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/demo" variant="white" size="lg">
              Try the demo form
            </ButtonLink>
            <ButtonLink href="/formly" variant="outline-light" size="lg">
              My Formly
            </ButtonLink>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <HeroMock />
        </div>
      </div>
    </section>
  );
}

/* ---------- 2. Retyping ---------- */

function Retyping() {
  return (
    <Section tone="paper" label="Retyping">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <H2>You&apos;ve typed this a hundred times.</H2>
          <p className="mt-4 max-w-md text-[16px] leading-[1.5] text-slate">
            Same address, same phone number, same employer, for every business that asks. T-Mobile&apos;s sign-up alone
            is 33 fields.
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-surface">
          <AddressTypewriter />
        </div>
      </div>
    </Section>
  );
}

/* ---------- 3. Forms lose people ---------- */

function Stat({ value, children, source }: { value: string; children: React.ReactNode; source: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-6 shadow-surface">
      <p className="font-display text-[48px] leading-none font-semibold tracking-[-0.02em]">{value}</p>
      <p className="mt-3 flex-1 text-[16px] leading-[1.5]">{children}</p>
      <div className="mt-4">
        <Source>{source}</Source>
      </div>
    </div>
  );
}

function LosePeople() {
  return (
    <Section tone="paper" label="Forms lose people" divided>
      <H2>Forms lose people.</H2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Stat value="70%" source="Baymard Institute, 2025, average of 50 studies">
          of online checkouts are abandoned before they finish.
        </Stat>
        <Stat value="47.8%" source="Zuko form benchmarks, 2025, 2.2M telecom form sessions">
          of telecom sign-up forms convert. More than half the people who start one never finish.
        </Stat>
        <div className="sm:col-span-2">
          <Stat value="0" source="WHATWG HTML standard, autofill field names">
            autofill fields exist for SSN, ID number, income, carrier account number or transfer PIN.
          </Stat>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 4. Autofill gap ---------- */

function AutofillGap() {
  return (
    <Section tone="paper" label="Autofill versus Formly" divided>
      <H2>Autofill stops where sign-ups get hard.</H2>
      <p className="mt-4 max-w-xl text-[16px] leading-[1.5] text-slate">
        Your browser knows your name, address and card. The ID, the job, the plan and the number you&apos;re bringing
        over, you type. Flip it and see.
      </p>
      <div className="mt-8">
        <AutofillGrid />
      </div>
      <div className="mt-6">
        <Source>
          Fields from our replica of a carrier sign-up. Dashed fields have no browser autofill name in the WHATWG
          standard, or browsers don&apos;t save them.
        </Source>
      </div>
    </Section>
  );
}

/* ---------- 5. Answers already exist ---------- */

const ANSWERS = [
  { field: "Current carrier", value: "Verizon", source: "Your Verizon bill in Gmail" },
  { field: "Number to transfer", value: "206-555-0147", source: "Your Verizon bill in Gmail" },
  { field: "Home address", value: "4521 Brooklyn Ave NE, Apt 3B", source: "Your personal info PDF" },
  { field: "Employer", value: "Northwind Robotics", source: "Your resume in Google Drive" },
];

function AnswersExist() {
  return (
    <Section tone="paper" label="Answers with sources" divided>
      <H2>The answers already exist in your accounts.</H2>
      <p className="mt-4 max-w-xl text-[16px] leading-[1.5] text-slate">
        Formly reads what you connect and finds each answer, so you don&apos;t have to remember it.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {ANSWERS.map((a, i) => (
          <li
            key={a.field}
            className="rounded-xl border border-rule bg-white bg-[linear-gradient(var(--green),var(--green))] bg-[length:3px_100%] bg-left bg-no-repeat p-4 pl-5"
          >
            <p className="text-[13px] font-medium text-slate">{a.field}</p>
            <p className="mt-0.5 text-[16px]">{a.value}</p>
            <p className="mt-2 inline-flex rounded-full bg-mist px-2.5 py-0.5 text-[13px]">{a.source}</p>
            {i === 0 && (
              <div className="mt-3 flex gap-2 border-t border-mist pt-3" aria-label="Controls on every answer">
                {["Edit", "Remove", "Censor"].map((c) => (
                  <span key={c} className="rounded-lg border border-rule px-2.5 py-1 text-[13px] font-medium">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
        <li className="rounded-xl border border-dashed border-rule p-4 sm:col-span-2">
          <p className="text-[13px] font-medium text-slate">Transfer PIN</p>
          <p className="mt-0.5 text-[16px] text-slate">Not found. Type it or leave it blank.</p>
        </li>
      </ul>
    </Section>
  );
}

/* ---------- 6. How it fills ---------- */

const STEPS = [
  { title: "Read", body: "Gemini reads your PDFs, photos and docs" },
  { title: "Twin", body: "One profile, every fact tagged with its source" },
  { title: "Fill", body: "The business's form plus your twin gives the answers" },
  { title: "You review and approve", body: "Answers drop into the form" },
];

function HowItFills() {
  return (
    <Section tone="paper" label="How it works" divided>
      <H2>How Formly fills a form.</H2>
      <ol className="relative mt-10 grid gap-8 sm:grid-cols-4 sm:gap-6">
        {/* The connector: down the left on phones, across the top from step 1 to step 4 on wider screens. */}
        <span
          aria-hidden
          className="absolute top-4 bottom-4 left-[17px] w-px bg-rule sm:top-[17px] sm:right-[calc(25%-18px)] sm:bottom-auto sm:left-[18px] sm:h-px sm:w-auto"
        />
        {STEPS.map((s, i) => {
          const last = i === STEPS.length - 1;
          return (
            <li key={s.title} className="relative flex gap-4 sm:block">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-semibold ${
                  last ? "bg-brand text-white" : "border border-rule bg-paper text-navy"
                }`}
              >
                {last ? <CheckIcon className="h-5 w-5" stroke={2} /> : i + 1}
                {last && <span className="sr-only">4</span>}
              </span>
              <div className="sm:mt-4">
                <p className="font-display text-[18px] font-semibold tracking-[-0.01em]">{s.title}</p>
                <p className="mt-1 text-[16px] leading-[1.5] text-slate">{s.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

/* ---------- 7. Answers, not accounts ---------- */

const GROUPS = ["Contact and address", "IDs", "Payment card", "Work and income", "Plan and device"];

function AnswersNotAccounts() {
  return (
    <Section tone="ink" label="Privacy">
      <H2>The business gets answers, not accounts.</H2>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px_1fr] lg:items-center">
        <div className="rounded-2xl border border-white/15 p-5">
          <p className="text-[13px] font-medium text-white/60">Your side</p>
          <p className="mt-2 font-display text-[18px] font-semibold">Your documents and accounts</p>
          <p className="mt-1 text-[15px] leading-[1.5] text-white/75">Gmail, Google Drive, the files you upload</p>
          <div className="my-4 h-px bg-white/15" />
          <p className="font-display text-[18px] font-semibold">Your twin</p>
          <p className="mt-1 text-[15px] leading-[1.5] text-white/75">
            One profile, every fact with its source. It stays with Formly and you.
          </p>
        </div>

        <PermissionCard />

        <div className="rounded-2xl border border-white/15 p-5">
          <p className="text-[13px] font-medium text-white/60">Their side</p>
          <p className="mt-2 font-display text-[18px] font-semibold">The finished form only</p>
          <ul className="mt-3 space-y-2 text-[15px]">
            {[
              ["Full name", "Alex Chen"],
              ["Number to transfer", "206-555-0147"],
              ["Home address", "4521 Brooklyn Ave NE"],
            ].map(([k, v]) => (
              <li key={k} className="border-l-[3px] border-volt pl-3">
                <span className="block text-[13px] text-white/60">{k}</span>
                {v}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10">
        <p className="text-[13px] font-medium text-white/60">What Formly asks you about</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <li key={g} className="rounded-full border border-white/20 px-3 py-1 text-[14px]">
              {g}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[16px] leading-[1.5]">
          Auto mode asks before IDs and cards. Share everything never asks.
        </p>
      </div>
    </Section>
  );
}

/** A still of the app's permission prompt (components/PermissionPrompt.tsx). Not interactive. */
function PermissionCard() {
  return (
    <div className="rounded-2xl bg-white p-4 text-navy shadow-lg" aria-label="Example permission prompt">
      <p className="text-[11px] font-semibold tracking-wider text-slate uppercase">Permission request</p>
      <p className="mt-2 text-[15px] leading-[1.45]">
        <strong>T-Mobile</strong> is asking for <strong>your IDs (SSN, driver&apos;s license)</strong>
      </p>
      <ul className="mt-4 space-y-2 text-[14px] font-medium">
        {["Allow once", "Always allow", "Deny"].map((c, i) => (
          <li
            key={c}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
              i === 0 ? "bg-navy text-white" : "shadow-surface"
            }`}
          >
            <kbd
              className={`flex h-5 w-5 items-center justify-center rounded font-sans text-[11px] ${
                i === 0 ? "bg-white/15" : "bg-mist text-slate"
              }`}
            >
              {i + 1}
            </kbd>
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 8. For businesses ---------- */

const BIZ_STEPS = [
  "Describe your form as a schema: each field, its type, and whether it's required.",
  "Add the Fill with Formly button above your manual fields.",
  "Get back only the answers your customer approved, and drop them into your form.",
];

function ForBusinesses() {
  return (
    <Section tone="paper" label="For businesses">
      <H2>For businesses: one button, one schema.</H2>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <ol className="space-y-4">
            {BIZ_STEPS.map((s, i) => (
              <li key={s} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rule bg-white font-display text-[14px] font-semibold">
                  {i + 1}
                </span>
                <p className="pt-1 text-[16px] leading-[1.5]">{s}</p>
              </li>
            ))}
          </ol>
          <pre className="mt-6 rounded-xl whitespace-pre-wrap break-words bg-navy p-4 text-[14px] leading-[1.5] text-white">
            <code>{"<FormlyButton schema={signup} onFilled={fill} />"}</code>
          </pre>
        </div>
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-4 shadow-surface">
              <p className="text-[13px] font-medium text-slate">Person</p>
              <p className="mt-1 font-display text-[22px] font-semibold">Free</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-surface">
              <p className="text-[13px] font-medium text-slate">Business</p>
              <p className="mt-1 text-[15px] leading-[1.4]">Pays per completed form</p>
            </div>
          </div>
          <p className="mt-4 text-[16px] leading-[1.5]">
            Each finished sign-up is worth real money to the business. For a carrier, about $1,835 a year per account.
          </p>
          <div className="mt-1">
            <Source>Our estimate from T-Mobile&apos;s public filings.</Source>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 9. Comparison ---------- */

const OTHERS = [
  { name: "Browser autofill", fills: "Fills name, address and card." },
  { name: "Password managers", fills: "Fill logins and saved identities." },
  { name: "Plaid", fills: "Shares bank data with apps." },
  { name: "Formly", fills: "Fills any field, from your own documents, with a source and your approval." },
];

function Comparison() {
  return (
    <Section tone="paper" label="Comparison" divided>
      <H2>Others fill a slice. Formly fills the form.</H2>
      <ul className="mt-8 divide-y divide-mist overflow-hidden rounded-2xl bg-white shadow-surface">
        {OTHERS.map((o) => {
          const us = o.name === "Formly";
          return (
            <li
              key={o.name}
              className={`grid gap-1 px-5 py-4 sm:grid-cols-[200px_1fr] sm:gap-6 ${us ? "border-l-4 border-brand" : "border-l-4 border-transparent"}`}
            >
              <p className={`font-display text-[16px] font-semibold ${us ? "" : "text-slate"}`}>{o.name}</p>
              <p className="text-[16px] leading-[1.5]">{o.fills}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ---------- 10. Everywhere ---------- */

const MERCHANTS = [
  { href: "/tmobile", name: "T-Mobile", kind: "Carrier sign-up" },
  { href: "/chase", name: "Chase", kind: "Credit card application" },
  { href: "/spacexai", name: "SpaceXAI", kind: "Job application" },
];

function Everywhere() {
  return (
    <Section tone="paper" label="Works everywhere" divided>
      <H2>Your twin works everywhere.</H2>
      <p className="mt-4 max-w-xl text-[16px] leading-[1.5] text-slate">
        Connect once, fill every form. One company alone can&apos;t offer that.
      </p>
      <ul className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MERCHANTS.map((m) => (
          <li key={m.href}>
            <Link
              href={m.href}
              className="group flex h-full min-h-28 flex-col rounded-2xl border border-transparent bg-white p-4 shadow-surface transition hover:shadow-surface-hover"
            >
              <span className="font-display text-[18px] font-semibold">{m.name}</span>
              <span className="mt-1 flex-1 text-[14px] text-slate">{m.kind}</span>
              <span className="mt-3 flex items-center gap-1.5 text-[14px] font-medium">
                Try it
                <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" stroke={2} />
              </span>
            </Link>
          </li>
        ))}
        <li className="flex min-h-28 flex-col rounded-2xl border border-dashed border-rule p-4">
          <span className="font-display text-[18px] font-semibold text-slate">A landlord</span>
          <span className="mt-1 text-[14px] text-slate">Rental application · no demo yet</span>
        </li>
      </ul>
    </Section>
  );
}

/* ---------- 11. Race ---------- */

function Race() {
  return (
    <Section tone="paper" label="Race" divided>
      <div className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-surface sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <H2>Race us.</H2>
          <p className="mt-2 max-w-lg text-[16px] leading-[1.5] text-slate">
            The usual way vs Fill with Formly. Same form, two phones, sixty seconds.
          </p>
        </div>
        <ButtonLink href="/race" variant="ink" size="lg">
          Start the race
        </ButtonLink>
      </div>
    </Section>
  );
}

/* ---------- 12. Built in 24 hours + footer ---------- */

const LIVE = [
  "Fill with Formly on three demo forms: T-Mobile, Chase and SpaceXAI",
  "Google sign-in, file upload, ID photos and scan from your phone",
  "A twin built by Gemini, with a source for every answer",
  "Permission prompts before IDs and cards",
  "Your data deleted after an hour, or now in one tap",
];

const NEXT = [
  "More connectors (OneDrive, Outlook)",
  "A form standard any business can adopt",
  "Signed completed forms",
  "A browser extension for sites without the button",
];

function Built() {
  return (
    <Section tone="ink" label="Built in 24 hours">
      <H2>Built in 24 hours.</H2>
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        {[
          { title: "Live today", items: LIVE, live: true },
          { title: "Next", items: NEXT, live: false },
        ].map((col) => (
          <div key={col.title}>
            <p className="text-[13px] font-medium text-white/60">{col.title}</p>
            <ul className="mt-3 space-y-2.5">
              {col.items.map((t) => (
                <li key={t} className="flex gap-3 text-[16px] leading-[1.5]">
                  {col.live ? (
                    <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-volt" stroke={2} />
                  ) : (
                    <span aria-hidden className="mt-[11px] h-px w-4 shrink-0 bg-white/40" />
                  )}
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-navy text-white">
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-10">
        <Logo light />
        <p className="max-w-2xl text-[15px] leading-[1.5] text-white/80">
          Formly. Built at DubHacks 2026 for the T-Mobile track by Khangai Sukhbaatar, Salvo Bonsma and Jerry Zheng.
        </p>
        <p className="text-[13px] text-white/60">Next.js, TypeScript, Gemini, SQLite, Docker on Dokploy.</p>
        <nav className="-ml-2 flex flex-wrap text-[14px]" aria-label="Footer">
          {[
            { href: "/demo", label: "Demo forms" },
            { href: "/formly", label: "My Formly" },
            { href: "/race", label: "Race" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-11 items-center px-2 text-white/80 hover:text-white">
              {l.label}
            </Link>
          ))}
          <a href={REPO} className="flex min-h-11 items-center px-2 text-white/80 hover:text-white">
            Code on GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
