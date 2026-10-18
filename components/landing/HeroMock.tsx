import type { CSSProperties } from "react";
import { Mark } from "@/components/Logo";

const FIELDS = [
  { label: "Full name", placeholder: "First and last name", value: "Alex Chen" },
  { label: "Phone number", placeholder: "(000) 000-0000", value: "206-555-0147" },
  { label: "Home address", placeholder: "Street, apt, city, ZIP", value: "4521 Brooklyn Ave NE, Apt 3B" },
];

/**
 * A sign-up card with the Fill with Formly button above the manual fields. The fields fill one by one with
 * CSS only (.landing-fill in globals.css), so it works without JavaScript and shows filled under reduced motion.
 */
export function HeroMock() {
  return (
    <div
      role="img"
      aria-label="A sign-up form with the Fill with Formly button above the manual fields. Full name, phone number and home address fill in one by one."
      className="w-full max-w-[400px] rounded-2xl bg-paper p-5 text-navy shadow-surface sm:p-6"
    >
      <p className="font-display text-[18px] font-semibold tracking-[-0.01em]">Create your account</p>
      <p className="mt-1 text-[13px] text-slate">Step 1 of 4 · About you</p>

      {/* Same look as components/FormlyButton.tsx, at the brand spec: 52px, 12px radius, 22px mark, 10px gap. */}
      <div className="mt-5 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-navy font-display text-[16px] font-semibold tracking-[-0.01em] text-white">
        <Mark light className="h-[22px] w-[22px]" />
        Fill with Formly
      </div>

      <div className="my-4 flex items-center gap-3 text-[13px] text-slate">
        <span className="h-px flex-1 bg-rule" />
        or type it yourself
        <span className="h-px flex-1 bg-rule" />
      </div>

      <div className="space-y-3">
        {FIELDS.map((f, i) => {
          const delay = { "--fill-delay": `${1.1 + i * 0.55}s` } as CSSProperties;
          return (
            <div key={f.label}>
              <p className="text-[13px] font-medium">{f.label}</p>
              <div
                style={delay}
                className="landing-fill relative mt-1 flex h-11 items-center rounded-xl border border-rule px-3 text-[15px]"
              >
                <span style={delay} className="landing-fill-empty absolute inset-x-3 truncate text-slate/70">
                  {f.placeholder}
                </span>
                <span style={delay} className="landing-fill-value truncate">
                  {f.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
