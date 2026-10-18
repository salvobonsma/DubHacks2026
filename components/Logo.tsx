/** Brand colors from deck/brand: Ink on light, Fern accent on light, Volt accent on dark. */
const INK = "#0F1A2A";
const FERN = "#0FA968";
const VOLT = "#22C985";

/** The Formly mark: a slanted F with a lightning-notch stem, traced from deck/brand/png/mark-light.png. */
export function Mark({ className = "h-5 w-5", light = false }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 247 296" className={className} aria-hidden>
      <path fill={light ? "#ffffff" : INK} d="M55.6 0h74l-30 100h33L74.2 296H0.2l38.4-128H5.2z" />
      <path fill={light ? VOLT : FERN} d="M140.6 0h106l-20.4 68h-106zM144.6 100h72l-20.4 68h-72z" />
    </svg>
  );
}

/** Mark + "formly" wordmark in Sora SemiBold, tracked -3.5%. */
export function Logo({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark light={light} className="h-7 w-7" />
      <span
        className={`font-display text-[28px] leading-none font-semibold tracking-[-0.035em] ${light ? "text-white" : "text-navy"}`}
      >
        formly
      </span>
    </span>
  );
}
