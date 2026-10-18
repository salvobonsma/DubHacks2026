import { Fragment } from "react";

/** Tiny renderer for the twin's markdown (headings, bullets, **bold**, _italic_). */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-[14px] leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ") || line.startsWith("# "))
          return (
            <h3 key={i} className="pt-3 text-xs font-bold uppercase tracking-wider text-brand-dark">
              {line.replace(/^#+\s*/, "")}
            </h3>
          );
        if (/^\s*[-*]\s/.test(line))
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-brand">•</span>
              <span>{inline(line.replace(/^\s*[-*]\s/, ""))}</span>
            </div>
          );
        if (!line.trim()) return null;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|_\([^)]*\)_|_[^_]+_)/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_"))
      return (
        <em key={i} className="text-xs not-italic text-muted">
          {part.slice(1, -1)}
        </em>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}
