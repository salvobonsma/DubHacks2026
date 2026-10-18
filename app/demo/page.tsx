import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import spacexai from "@/lib/schemas/spacexai.json";
import tmobile from "@/lib/schemas/tmobile.json";

export const metadata: Metadata = {
  title: "Demo forms | Formly",
};

/** Pick which merchant form to try the Fill with Formly button on. */
export default function DemoPicker() {
  return (
    <div className="flex-1">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <Link href="/">
            <Logo light />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-[28px] leading-tight">Pick a demo form</h1>
        <p className="mt-2 max-w-xl text-muted">
          Both use the same Fill with Formly button. Connect your data once, then try either one.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link
            href="/tmobile"
            className="group flex flex-col rounded-2xl border border-transparent bg-white p-6 shadow-surface transition hover:shadow-surface-hover"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tmobile/logo.png" alt="T-Mobile" className="h-7 w-fit" />
            <h2 className="mt-6 text-xl">{tmobile.title}</h2>
            <p className="mt-1 text-sm text-muted">{tmobile.fields.length} fields · ID, payment card, credit check</p>
            <p className="mt-4 flex-1 text-[15px]">
              A long carrier signup. Formly fills your contact info, ID and card, and asks before it shares anything
              sensitive.
            </p>
            <span className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-magenta">
              Open the T-Mobile form
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" stroke={2} />
            </span>
          </Link>

          <Link
            href="/spacexai"
            className="group flex flex-col rounded-2xl border border-white/10 bg-black p-6 text-white shadow-surface transition hover:border-white/25"
          >
            <span className="flex h-7 items-center text-[17px] font-semibold tracking-[0.34em]">SPACEXAI</span>
            <h2 className="mt-6 text-xl">{spacexai.title}</h2>
            <p className="mt-1 text-sm text-white/60">
              {spacexai.fields.length} fields · education, experience, 2 short answers
            </p>
            <p className="mt-4 flex-1 text-[15px] text-white/85">
              A job application. Formly reads your resume for the basics, then drafts both 50-word short answers in
              your own words.
            </p>
            <span className="mt-6 flex items-center gap-1.5 text-sm font-semibold">
              Open the SpaceXAI application
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" stroke={2} />
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
