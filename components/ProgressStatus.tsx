"use client";

export interface ProgressTask {
  /** The one honest line shown while the work runs, e.g. "Reading resume.pdf…". */
  label?: string;
  /** Older callers pass a list of steps; only the first is shown, since nothing reports real progress. */
  steps?: string[];
  /** Ignored. Kept so older callers still compile. */
  expectedMs?: number;
}

/**
 * Status for slow server work (LLM calls) that can't report real progress: one label and an
 * indeterminate bar, so the wait never looks frozen and never shows a made-up percentage.
 */
export function ProgressStatus({
  label,
  task,
  className = "",
}: {
  label?: string;
  task?: ProgressTask;
  className?: string;
}) {
  const text = label ?? task?.label ?? task?.steps?.[0] ?? "Working…";

  return (
    <div className={className} role="status" aria-live="polite">
      <style href="formly-progress" precedence="default">
        {`@keyframes formly-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }`}
      </style>
      <p className="mb-1.5 text-sm font-medium text-brand-dark">{text}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-brand/15">
        <div className="h-full w-2/5 animate-[formly-progress_1.4s_ease-in-out_infinite] rounded-full bg-brand motion-reduce:w-full motion-reduce:animate-none" />
      </div>
    </div>
  );
}
