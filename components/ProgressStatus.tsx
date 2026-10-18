"use client";

import { useEffect, useState } from "react";

export interface ProgressTask {
  /** What Formly is doing, in order. The label advances as the bar passes each step's share. */
  steps: string[];
  /** Rough time the work usually takes; the bar eases toward 95% around then and keeps creeping after. */
  expectedMs: number;
}

/**
 * Estimated progress for slow server work (LLM calls) that can't report real progress. The bar
 * always moves, fast at first and slower near the end, so a long wait never looks frozen.
 */
export function ProgressStatus({ task, className = "" }: { task: ProgressTask; className?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(t);
    // Time from when the bar appears; callers may pass a fresh task object on every render.
  }, []);

  // 1 - e^(-3t/T): ~95% at the expected time, then slowly approaches 99%.
  const pct = Math.min(99, 100 * (1 - Math.exp((-3 * elapsed) / task.expectedMs)));
  const step = task.steps[Math.min(task.steps.length - 1, Math.floor((pct / 100) * task.steps.length))];

  return (
    <div className={className} role="status" aria-live="polite">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-brand-dark">{step}</span>
        <span className="text-xs tabular-nums text-muted">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-brand/15">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-200 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
