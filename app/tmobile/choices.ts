/**
 * The choices the user made themselves on the T-Mobile page (lines, plan, phone, number), mirrored into a short-lived
 * cookie next to the tab's snapshot. Only these choice fields, never personal details. The server reads it on a
 * same-tab Formly return, so the first paint already keeps "2 lines" instead of flashing Formly's suggestion of 1.
 */
export const CHOICES_COOKIE = "formly_tm_choices";

/** The cookie's value parsed, or null; each value is still checked against the schema by the page. */
export function parseChoices(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) as Record<string, string>;
  } catch {
    return null;
  }
}
