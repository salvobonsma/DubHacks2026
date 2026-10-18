/**
 * Line icons on a 24-unit grid, drawn in currentColor. Strokes don't scale with the icon
 * (see .icon-line in globals.css), so `stroke` is the rendered width in px: 1.25 next to
 * regular text, 1.5 next to medium/semibold, 2 for a bold or standalone icon.
 */
function Icon({ className, stroke, children }: { className: string; stroke: number; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon-line ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string; stroke?: number };

export function LockIcon({ className = "h-3.5 w-3.5", stroke = 1.5 }: IconProps) {
  return (
    <Icon className={className} stroke={stroke}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

export function CheckIcon({ className = "h-4 w-4", stroke = 1.5 }: IconProps) {
  return (
    <Icon className={className} stroke={stroke}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function CloseIcon({ className = "h-5 w-5", stroke = 1.5 }: IconProps) {
  return (
    <Icon className={className} stroke={stroke}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function WarningIcon({ className = "h-3.5 w-3.5", stroke = 1.5 }: IconProps) {
  return (
    <Icon className={className} stroke={stroke}>
      <path d="M10.3 4.1 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4M12 17h.01" />
    </Icon>
  );
}

export function ArrowRightIcon({ className = "h-3 w-3", stroke = 1.25 }: IconProps) {
  return (
    <Icon className={className} stroke={stroke}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}
