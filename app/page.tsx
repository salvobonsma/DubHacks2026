import Link from "next/link";
import { ArrowRightIcon, CheckIcon, LockIcon } from "@/components/Icons";
import { Logo, Mark } from "@/components/Logo";
import "./home.css";

const DEMOS = [
  { href: "/tmobile", logo: "/tmobile/t-mark.svg", w: 32, h: 32, name: "T-Mobile", title: "Switch to T-Mobile" },
  { href: "/spacexai", logo: "/spacexai/logo-black.png", w: 58, h: 22, name: "SpaceXAI", title: "Software Engineer application" },
  { href: "/chase", logo: "/chase/logo-blue.svg", w: 86, h: 16, name: "Chase", title: "Freedom Unlimited card application" },
  { href: "/dmv", logo: "/dmv/logo-ca-dmv-blue.svg", w: 62, h: 24, name: "California DMV", title: "Title or register a vehicle" },
];

export default function Home() {
  return (
    <div className="home flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
        <Logo />
        <Link href="/formly" className="text-[15px] font-medium text-[var(--home-muted)] transition-colors hover:text-[var(--home-ink)]">
          My Formly
        </Link>
      </header>

      <main>
        {/* Hero: what Formly does, then the product doing it. */}
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-24 sm:px-8 lg:pt-24">
          <h1 className="home-h1">
            Stop retyping your life
            <span className="home-soft block">into every signup form.</span>
          </h1>
          <div className="mt-8 grid items-start gap-14 lg:mt-12 lg:grid-cols-[1fr_1.1fr]">
            <div className="lg:pt-2">
              <p className="home-lede max-w-[34rem]">
                Formly reads the documents and accounts you connect, fills out a business&apos;s form, and shows you
                every answer before it leaves. The business gets what you approve and never sees your files.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/demo" className="home-btn home-btn-primary">
                  Try a demo form
                </Link>
                <Link href="/formly" className="home-btn home-btn-secondary">
                  My Formly
                </Link>
              </div>
              <p className="mt-5 text-sm text-[var(--home-muted)]">
                No account needed. The demo runs on made-up people, so try anything.
              </p>
            </div>

            <HeroMockup />
          </div>
        </section>

        {/* How it treats your data, shown with the real twin UI rather than icon cards. */}
        <section className="border-t border-[var(--home-line)] bg-white">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2">
            <div>
              <h2 className="home-h2">
                Your files stay with you.
                <span className="home-soft block">Businesses get answers.</span>
              </h2>
              <div className="mt-8 max-w-[32rem] space-y-5 text-[17px] leading-relaxed text-[var(--home-muted)]">
                <p>
                  <strong className="font-semibold text-[var(--home-ink)]">Connect what you already have.</strong>{" "}
                  Google, iCloud or a folder of files. Formly reads them once and keeps a private profile of the facts
                  forms ask for, called your digital twin.
                </p>
                <p>
                  <strong className="font-semibold text-[var(--home-ink)]">Approve each answer.</strong> When a
                  business asks, Formly drafts their form from your twin and shows where every answer came from. Your
                  SSN, IDs and card numbers wait for an explicit yes.
                </p>
                <p>
                  <strong className="font-semibold text-[var(--home-ink)]">Edit the twin, not the form.</strong> Fix a
                  fact or mark it never to be shared, and every future form follows.
                </p>
              </div>
            </div>
            <TwinMockup />
          </div>
        </section>

        {/* The demos, as a plain list with each business's own mark. */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <h2 className="home-h2">
            Try it on a real-looking form.
            <span className="home-soft block">Four businesses, nine made-up people.</span>
          </h2>
          <ul className="home-surface mt-10 divide-y divide-[var(--home-line)] overflow-hidden rounded-2xl">
            {DEMOS.map((d) => (
              <li key={d.href}>
                <Link href={d.href} className="home-row-link group flex items-center gap-4 px-5 py-4 sm:px-6">
                  <span className="flex h-10 w-24 shrink-0 items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.logo} alt={d.name} width={d.w} height={d.h} className="max-h-8 w-auto object-contain object-left" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-[var(--home-muted)] transition-transform motion-safe:group-hover:translate-x-0.5" stroke={1.5} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-[var(--home-line)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-8 text-sm text-[var(--home-muted)] sm:px-8">
          <span className="flex items-center gap-2 text-[var(--home-ink)]">
            <Mark className="h-4 w-4" />
            <span className="font-display font-semibold">formly</span>
          </span>
          <span>Made at DubHacks 2026.</span>
        </div>
      </footer>
    </div>
  );
}

/** A rental application Formly has just filled, with Formly's review window laid over its corner. */
function HeroMockup() {
  const fields = [
    { label: "Full legal name", value: "Alexander Wei Chen" },
    { label: "Date of birth", value: "04/12/1999" },
    { label: "Current address", value: "4521 Brooklyn Ave NE, Apt 3B, Seattle, WA 98105", wide: true },
    { label: "Employer", value: "Northwind Robotics" },
    { label: "Monthly income", value: "$10,666" },
  ];
  const review = [
    { label: "Full legal name", value: "Alexander Wei Chen", source: "Google" },
    { label: "Date of birth", value: "04/12/1999", source: "Personal info.txt" },
    { label: "Monthly income", value: "$10,666", source: "Personal info.txt" },
  ];
  return (
    <div aria-hidden>
      {/* The business's form. */}
      <div className="home-surface rounded-2xl p-5 sm:p-7 lg:mr-10">
        <p className="font-display text-[15px] font-semibold">Cedar &amp; Pine Apartments</p>
        <p className="text-sm text-[var(--home-muted)]">Rental application</p>
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3.5">
          {fields.map((f) => (
            <div key={f.label} className={f.wide ? "col-span-2" : ""}>
              <p className="mb-1 text-xs font-medium text-[var(--home-muted)]">{f.label}</p>
              <p className="home-input home-filled">{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Formly's review window, a separate surface overlapping the form. */}
      <div className="home-surface relative z-10 -mt-16 ml-auto w-[min(300px,82%)] overflow-hidden rounded-[14px]">
        <div className="flex items-center justify-between bg-navy px-4 py-2.5">
          <span className="flex items-center gap-2 text-white">
            <Mark light className="h-4 w-4" />
            <span className="font-display text-sm font-semibold">formly</span>
          </span>
          <LockIcon className="h-3 w-3 text-[#22C985]" />
        </div>
        <div className="px-4 pt-3 pb-4">
          <p className="text-[13px] font-semibold">Review what you&apos;ll share</p>
          <ul className="mt-2 space-y-2">
            {review.map((r) => (
              <li key={r.label} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-brand text-white">
                  <CheckIcon className="h-3 w-3" stroke={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-[var(--home-muted)]">{r.label}</span>
                  <span className="block truncate text-[13px]">{r.value}</span>
                </span>
                <span className="home-chip mt-0.5 max-w-[42%]">{r.source}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-brand py-2 text-center text-[13px] font-semibold text-navy">Approve &amp; send 5 answers</p>
        </div>
      </div>
    </div>
  );
}

/** An excerpt of the digital twin, with one fact the user has chosen never to share. */
function TwinMockup() {
  const facts = [
    { label: "Legal name", value: "Alexander Wei Chen", source: "Google" },
    { label: "Home address", value: "4521 Brooklyn Ave NE, Apt 3B, Seattle", source: "Personal info.txt" },
    { label: "Vehicle", value: "2019 Subaru Crosstrek, WA plate CDK4917", source: "Personal info.txt" },
    { label: "Allergies", value: "Penicillin", source: "Health" },
    { label: "SSN", value: "", source: "", hidden: true },
  ];
  return (
    <div className="home-surface self-start rounded-2xl p-5 sm:p-7" aria-hidden>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[15px] font-semibold">Your digital twin</p>
        <p className="text-xs text-[var(--home-muted)]">Updated just now</p>
      </div>
      <ul className="mt-4 divide-y divide-[var(--home-line)]">
        {facts.map((f) => (
          <li key={f.label} className="flex items-center gap-3 py-3">
            <span className="w-28 shrink-0 text-sm text-[var(--home-muted)]">{f.label}</span>
            {f.hidden ? (
              <span className="flex flex-1 items-center gap-2 text-sm">
                <LockIcon className="h-3.5 w-3.5 text-[var(--home-muted)]" />
                Never shared
              </span>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm">{f.value}</span>
                <span className="home-chip hidden max-w-[40%] sm:inline-block">{f.source}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
