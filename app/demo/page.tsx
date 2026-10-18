import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/Icons";
import { FormlyHeader } from "@/components/FormlyHeader";
import { SampleData } from "@/components/SampleData";
import chase from "@/lib/schemas/chase.json";
import spacexai from "@/lib/schemas/spacexai.json";
import tmobile from "@/lib/schemas/tmobile.json";

export const metadata: Metadata = {
  title: "Demo forms | Formly",
};

/** Pick which merchant form to try the Fill with Formly button on. */
export default function DemoPicker() {
  return (
    <div className="flex-1">
      <FormlyHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-[28px] leading-tight">Pick a demo form</h1>
        <p className="mt-2 max-w-xl text-muted">
          All three use the same Fill with Formly button. Connect your data once, then try any of them.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/tmobile"
            className="group flex flex-col rounded-2xl border border-transparent bg-white p-6 shadow-surface transition hover:shadow-surface-hover"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tmobile/logo.png" alt="T-Mobile" className="h-7 w-fit" />
            <h2 className="mt-6 text-xl">{tmobile.title}</h2>
            <p className="mt-1 text-sm text-muted">Plan, phone and your info, up to the credit check</p>
            <p className="mt-4 flex-1 text-[15px]">
              The carrier signup from the T-Mobile race. Formly suggests a plan and line count with a reason, fills
              your name, contact info and address, and leaves the SSN, PIN and consents to you.
            </p>
            <span className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-magenta">
              Open the T-Mobile form
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" stroke={2} />
            </span>
          </Link>

          <Link
            href="/spacexai"
            className="group flex flex-col rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 text-white shadow-surface transition hover:border-white/25"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/spacexai/logo-white.png" alt="SpaceXAI" className="h-7 w-fit" />
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

          <Link
            href="/chase"
            className="group flex flex-col rounded-2xl border border-transparent bg-[#005eb8] p-6 text-white shadow-surface transition hover:bg-[#004a91]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chase/logo-white.svg" alt="Chase" className="h-6 w-fit" />
            <h2 className="mt-7 text-xl">{chase.title}</h2>
            <p className="mt-1 text-sm text-white/70">{chase.fields.length} fields · SSN, address, income</p>
            <p className="mt-4 flex-1 text-[15px] text-white/90">
              A Visa credit card application. Formly fills your identity, address and income. Your SSN is never
              filled: you type it on Chase&apos;s form.
            </p>
            <span className="mt-6 flex items-center gap-1.5 text-sm font-semibold">
              Open the Chase application
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" stroke={2} />
            </span>
          </Link>
        </div>
        <SampleData />
      </main>
    </div>
  );
}
