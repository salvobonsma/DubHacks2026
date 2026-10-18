import type { FormField } from "./types";

export type SharingMode = "ask" | "auto" | "all";

export const MODES: { id: SharingMode; label: string; hint: string }[] = [
  { id: "ask", label: "Ask every time", hint: "Approve each group of info before it's shared" },
  { id: "auto", label: "Auto-share basics", hint: "Name, email, address go through; ask for anything personal" },
  { id: "all", label: "Share everything", hint: "No prompts — you still review before sending" },
];

/**
 * What a single permission prompt covers. Sensitive fields (SSN, card, ID number) get their own
 * prompt; everything else is grouped by form section.
 */
export function askKey(field: FormField) {
  return field.category === "sensitive" ? `field:${field.id}` : `section:${field.section}`;
}

export function needsPrompt(field: FormField, mode: SharingMode) {
  if (mode === "all") return false;
  if (mode === "ask") return true;
  return field.category !== "basic";
}
