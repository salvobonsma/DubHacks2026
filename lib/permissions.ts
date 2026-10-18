import type { FormField } from "./types";

export type SharingMode = "auto" | "all";

export const MODES: { id: SharingMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Asks before adding sensitive info" },
  { id: "all", label: "Share everything", hint: "Never asks" },
];

/** Broad buckets a permission prompt covers, so a long form only asks a handful of times. */
const GROUPS = {
  about: { title: "your contact info & address", protected: false },
  ids: { title: "your IDs (SSN, driver's license)", protected: true },
  payment: { title: "your payment card", protected: true },
  work: { title: "your work & income", protected: false },
  plan: { title: "your plan & device choices", protected: false },
  career: { title: "your education & work history", protected: false },
  answers: { title: "short answers written from your resume", protected: false },
} as const;

type Group = keyof typeof GROUPS;

function groupOf(field: FormField): Group {
  const where = `${field.section} ${field.label}`;
  if (field.type === "textarea") return "answers";
  if (/education|experience/i.test(field.section)) return "career";
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
  return GROUPS[groupOf(field)].protected;
}
