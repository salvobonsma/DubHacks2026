"use client";

import { useEffect, useState } from "react";

export interface ProgressTask {
  /** What Formly is doing, in order. The label advances as the bar passes each step's share. */
  steps: string[];
  /** Rough time the work usually takes; the bar eases toward 95% around then and keeps creeping after. */
  expectedMs: number;
  /** The work finished: fill the bar before it goes away (hold it for FINISH_MS). */
  done?: boolean;
}

/** How long callers keep a finished bar on screen so it visibly reaches 100%. */
export const FINISH_MS = 400;

const SEGMENTS = 12;

/** Random relative weights, normalized to sum to 1. */
function weights(n: number, min: number, max: number) {
  const w = Array.from({ length: n }, () => min + Math.random() * (max - min));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

/**
 * Estimated progress for slow server work (LLM calls) that can't report real progress. The bar
 * always moves, fast at first and slower near the end, so a long wait never looks frozen. Its
 * pace varies in bursts and lulls, and steps get uneven shares, so it reads like real work.
 */
export function ProgressStatus({ task, className = "" }: { task: ProgressTask; className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  // Per-run randomness: how much wall time each slice of the estimate takes, and each step's share.
  const [pace] = useState(() => weights(SEGMENTS, 0.25, 1.75));
  const [stepShares] = useState(() => weights(task.steps.length, 0.6, 1.4));

  useEffect(() => {
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setElapsed(now - start);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
    // Time from when the bar appears; callers may pass a fresh task object on every render.
  }, []);

  // Warp time: equal slices of the estimate each take a random share of wall time, so the bar
  // speeds up and slows down. Past the expected time it runs evenly.
  let t = 0;
  let wall = elapsed;
  for (const share of pace) {
    const span = share * task.expectedMs;
    if (wall <= span) {
      t += (wall / span) * (task.expectedMs / SEGMENTS);
      wall = 0;
      break;
    }
    t += task.expectedMs / SEGMENTS;
    wall -= span;
  }
  t += wall;

  // 1 - e^(-3t/T): ~95% at the expected time, then slowly approaches 99%.
  const pct = task.done ? 100 : Math.min(99, 100 * (1 - Math.exp((-3 * t) / task.expectedMs)));

  let stepIdx = 0;
  for (let acc = stepShares[0]; stepIdx < task.steps.length - 1 && pct / 100 >= acc; )
    acc += stepShares[++stepIdx];
  if (task.done) stepIdx = task.steps.length - 1;
  const step = task.steps[stepIdx];

  return (
    <div className={className} role="status" aria-live="polite">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span key={step} className="progress-step-in font-medium text-brand-dark">
          {step}
        </span>
        <span className="text-xs tabular-nums text-muted">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-brand/15">
        <div
          className={`relative h-full overflow-hidden rounded-full bg-brand ${
            task.done ? "transition-[width] duration-300 ease-out" : ""
          }`}
          style={{ width: `${pct}%` }}
        >
          <div className="progress-sheen absolute inset-y-0 left-0 w-2/5" />
        </div>
      </div>
    </div>
  );
}
