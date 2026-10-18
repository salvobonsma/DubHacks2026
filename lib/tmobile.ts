import snapshot from "./tmobile-snapshot.json";

/**
 * Client for the T-Mobile hackathon sandbox API (github.com/mageshkumarj/dubhacks). Each demo persona in
 * sample-data/ is the holder of one sandbox persona account. If the API isn't reachable (it isn't deployed
 * next to Formly), we fall back to a snapshot of those accounts taken from the same API.
 */
const API = process.env.TMOBILE_API_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");

/** sample-data folder → sandbox account, picked so the household roughly matches the person. */
export const TMOBILE_ACCOUNTS: Record<string, string> = {
  "alex-chen": "ACC-PERSONA-11",
  "maria-gonzalez": "ACC-PERSONA-12",
  "jamal-washington": "ACC-PERSONA-01",
  "dorothy-kowalski": "ACC-PERSONA-30",
  "hannah-mcallister": "ACC-PERSONA-35",
  "luis-ortega": "ACC-PERSONA-37",
  "priya-raman": "ACC-PERSONA-20",
  "tom-nguyen": "ACC-PERSONA-09",
  "aisha-bello": "ACC-PERSONA-25",
};

type Snapshot = Record<string, { context: Record<string, unknown>; billing: unknown[] }>;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(2000), cache: "no-store" });
  const body = (await res.json()) as { success: boolean; data: T; error?: { message?: string } };
  if (!body.success) throw new Error(body.error?.message ?? `T-Mobile API error on ${path}`);
  return body.data;
}

/** The account's context (plan, lines, phones, financing, usage) and monthly billing history. */
export async function fetchAccount(accountId: string): Promise<{ context: Record<string, unknown>; billing: unknown[] }> {
  if (API) {
    try {
      const [context, billing] = await Promise.all([
        get<Record<string, unknown>>(`/v1/customers/${accountId}/context`),
        get<unknown[]>(`/v1/customers/${accountId}/billing`),
      ]);
      return { context, billing };
    } catch {
      // Sandbox not running: use the snapshot.
    }
  }
  const saved = (snapshot as Snapshot)[accountId];
  if (!saved) throw new Error("Unknown T-Mobile account");
  return saved;
}
