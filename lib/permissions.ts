import type { FormField } from "./types";

export type SharingMode = "ask" | "auto" | "all";

export const MODES: { id: SharingMode; label: string; hint: string }[] = [
  { id: "ask", label: "Ask every time", hint: "Approve each group of info before it's shared" },
  { id: "auto", label: "Auto-share basics", hint: "Shares everything except IDs and payment cards, which ask first." },
  { id: "all", label: "Share everything", hint: "No prompts. You still review everything before it's sent." },
];

/** Broad buckets a permission prompt covers, so a long form only asks a handful of times. */
const GROUPS = {
  about: { title: "your contact info & address", protected: false },
  ids: { title: "your IDs (SSN, driver's license)", protected: true },
  payment: { title: "your payment card", protected: true },
  work: { title: "your work & income", protected: false },
  plan: { title: "your plan & device choices", protected: false },
} as const;

type Group = keyof typeof GROUPS;

function groupOf(field: FormField): Group {
  const where = `${field.section} ${field.label}`;
  if (/payment|card|billing/i.test(where)) return "payment";
  if (field.category === "sensitive" || /identity|license|passport|\bid\b/i.test(where)) return "ids";
  if (/credit|employ|income|job|housing/i.test(where)) return "work";
  if (/plan|device|carrier|lines|port/i.test(where)) return "plan";
  return "about";
}

/** What a single permission prompt (and an "always allow" grant) covers. */
export function askKey(field: FormField) {
  return `group:${groupOf(field)}`;
}

export function groupTitle(key: string) {
  return GROUPS[key.replace(/^group:/, "") as Group]?.title ?? key;
}

export function needsPrompt(field: FormField, mode: SharingMode) {
  if (mode === "all") return false;
  if (mode === "ask") return true;
  return GROUPS[groupOf(field)].protected;
}
