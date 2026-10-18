export function Mark({ className = "h-5 w-5", light = false }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 64 72" className={className} aria-hidden>
      <path fill={light ? "#ffffff" : "#111827"} d="M16 0h16l-6 34h4L18 72H4l8-32H8z" />
      <path fill="#5bc48a" d="M38 0h26l-3 14H35zM33 23h22l-3 14H30z" />
    </svg>
  );
}

export function Logo({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark light={light} className="h-6 w-6" />
      <span className={`text-2xl font-bold tracking-tight ${light ? "text-white" : "text-navy"}`}>formly</span>
    </span>
  );
}
