"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated, useReducedMotion } from "./motion";

const ADDRESS = "4521 Brooklyn Ave NE, Apt 3B, Seattle, WA 98105";
const LABELS = ["for T-Mobile", "for your bank", "for your landlord", "for your school", "for an airline", "for the DMV"];
/** Two deliberate typos, fixed mid-way: typed at `at`, held, then backspaced. */
const TYPOS: Record<number, { at: number; wrong: string }> = {
  1: { at: 10, wrong: "yl" },
  4: { at: ADDRESS.indexOf("Seattle") + 3, wrong: "tlte" },
};

type Frame = { label: number; text: string; wait: number };

/** Every keystroke as a frame. Typing speeds up label by label, like someone who has done this too often. */
function buildFrames(): Frame[] {
  const frames: Frame[] = [];
  LABELS.forEach((_, label) => {
    const speed = 60 - label * 7;
    frames.push({ label, text: "", wait: 400 });
    let typed = "";
    for (let k = 0; k < ADDRESS.length; k++) {
      const typo = TYPOS[label];
      if (typo && typo.at === k) {
        for (const c of typo.wrong) {
          typed += c;
          frames.push({ label, text: typed, wait: speed });
        }
        frames[frames.length - 1].wait = 450;
        for (let b = 0; b < typo.wrong.length; b++) {
          typed = typed.slice(0, -1);
          frames.push({ label, text: typed, wait: 90 });
        }
      }
      typed += ADDRESS[k];
      frames.push({ label, text: typed, wait: speed });
    }
    frames[frames.length - 1].wait = 1100;
  });
  return frames;
}

const FRAMES = buildFrames();

/**
 * One address field typed again and again while the label cycles through who is asking. Starts when scrolled
 * into view and ends on the finished line with all six askers as chips, which is also what renders without
 * JavaScript and under reduced motion.
 */
export function AddressTypewriter() {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const animate = hydrated && !reduced;

  useEffect(() => {
    if (!animate || started || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [animate, started]);

  useEffect(() => {
    if (!animate || !started || frame >= FRAMES.length) return;
    const t = setTimeout(() => setFrame((f) => f + 1), FRAMES[frame].wait);
    return () => clearTimeout(t);
  }, [animate, started, frame]);

  const done = !animate || frame >= FRAMES.length;
  const current = FRAMES[Math.min(frame, FRAMES.length - 1)];

  return (
    <div ref={ref}>
      <p className="sr-only">
        The same home address, {ADDRESS}, typed again {LABELS.join(", ")}.
      </p>
      <div aria-hidden>
        <p className="text-[13px] font-medium text-navy">
          Home address
          {!done && <span className="text-slate"> · {LABELS[current.label]}</span>}
        </p>
        <div className="mt-1 flex min-h-12 items-center rounded-xl border border-rule bg-white px-3 py-2 text-[15px] sm:text-[16px]">
          <span className="break-words">{done ? ADDRESS : current.text}</span>
          {!done && <span className="ml-px inline-block h-5 w-[2px] shrink-0 bg-navy" />}
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {LABELS.map((l, i) => {
            const now = !done && i === current.label;
            const later = !done && i > current.label;
            return (
              <li
                key={l}
                className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                  now ? "bg-navy text-white" : later ? "bg-mist text-slate" : "bg-mist text-navy"
                }`}
              >
                {l}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
