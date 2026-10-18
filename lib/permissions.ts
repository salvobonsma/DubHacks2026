import type { FormField } from "./types";

export type SharingMode = "auto" | "all";

export const MODES: { id: SharingMode; label: string; hint: string }[] = [
  { id: "auto", label: "Ask before sharing IDs and card", hint: "Asks before adding ID numbers or a payment card" },
  { id: "all", label: "Share everything without asking", hint: "Never asks" },
];

/** Broad buckets a permission prompt covers, so a long form only asks a handful of times. */
const GROUPS = {
  about: { title: "your contact info and address", protected: false },
  ids: { title: "your ID numbers", protected: true },
  payment: { title: "your payment card", protected: true },
  work: { title: "your work and income", protected: false },
  plan: { title: "your plan and device choices", protected: false },
  career: { title: "your education and work history", protected: false },
  answers: { title: "two short answers drafted from your resume", protected: false },
} as const;

type Group = keyof typeof GROUPS;

function groupOf(field: FormField): Group {
  const where = `${field.section} ${field.label}`;
  if (field.type === "textarea") return "answers";
  if (/education|experience/i.test(field.section)) return "career";
  // Billing preferences ("Paperless billing", "AutoPay") are choices, not the card itself.
  if (/paperless|auto ?pay|e-?bill/i.test(field.label)) return "plan";
  // "Monthly housing payment" is income/housing, not a card, so match the section rather than the word.
  if (/card|billing/i.test(where) || /^payment/i.test(field.section)) return "payment";
  if (field.category === "sensitive" || /identity|license|passport|\bid\b/i.test(where)) return "ids";
  if (/credit|employ|income|job|housing/i.test(where)) return "work";
  if (/plan|device|carrier|lines|port/i.test(where)) return "plan";
  return "about";
}

/** What a single permission prompt (and an "always allow" grant) covers. */
export function askKey(field: FormField) {
  return `group:${groupOf(field)}`;
}

/** Plain name for what a field holds. "" means it only describes another field (e.g. "Tax ID type"). */
const NOUNS: [RegExp, string][] = [
  [/tax id type|id type/i, ""],
  [/social security|\bssn\b/i, "Social Security number"],
  [/tax ?payer|tax id/i, "tax ID"],
  [/maiden/i, "mother's maiden name"],
  [/card|billing/i, "payment card"],
  [/license|passport|\bid\b|identity/i, "ID"],
  [/birth/i, "date of birth"],
];

const COUNT_WORDS = ["no", "a", "two", "three", "four", "five"];

/** Labels with no plain name of their own ("Issuing state", "Expiration") belong to the group's main item. */
const GROUP_NOUN: Partial<Record<Group, string>> = { ids: "ID", payment: "payment card" };

function nounOf(label: string, group: Group) {
  return (
    NOUNS.find(([re]) => re.test(label))?.[1] ??
    GROUP_NOUN[group] ??
    label.replace(/\s*\(optional\)/i, "").toLowerCase()
  );
}

function joinAnd(items: string[]) {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * The prompt title, named from the fields actually in the group ("your Social Security number and
 * ID"), so it never mentions something this form doesn't ask for. Falls back to the group's name.
 */
export function groupTitle(key: string, labels: string[] = []) {
  const group = key.replace(/^group:/, "") as Group;
  if (group === "answers" && labels.length) {
    const n = COUNT_WORDS[labels.length] ?? String(labels.length);
    return `${n} short answer${labels.length === 1 ? "" : "s"} drafted from your resume`;
  }
  const nouns = [...new Set(labels.map((l) => nounOf(l, group)).filter(Boolean))];
  if (nouns.length) return `your ${joinAnd(nouns)}`;
  return GROUPS[group]?.title ?? key;
}

export function needsPrompt(field: FormField, mode: SharingMode) {
  if (mode === "all") return false;
  return GROUPS[groupOf(field)].protected;
}
