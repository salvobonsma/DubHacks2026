import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { listGoogleAccounts, SAMPLE_ROOT } from "@/lib/personas";
import { fetchAccount, TMOBILE_ACCOUNTS } from "@/lib/tmobile";
import { rebuildTwin } from "@/lib/twin";

const ALL_SCOPES = ["account", "devices", "billing"] as const;
type Scope = (typeof ALL_SCOPES)[number];
const LABELS: Record<Scope, string> = { account: "Account & plan", devices: "Phones", billing: "Billing" };

/** Demo personas that hold a sandbox T-Mobile account, for the mock sign-in's account switcher. */
async function listAccounts() {
  return (await listGoogleAccounts()).filter((a) => TMOBILE_ACCOUNTS[a.id]);
}

export async function GET() {
  return Response.json({ accounts: await listAccounts() });
}

const dollars = (cents: unknown) => (typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : cents);

interface Line {
  member_label: string;
  member_role: string;
  plan_name: string;
  plan_data_cap_gb: number | null;
  byod: boolean;
  device: { name: string; purchase_date: string; age_months: number } | null;
  financing: { balance_cents: number; months_remaining: number; monthly_installment_cents: number; paid_off: boolean } | null;
  has_protection: boolean;
  upgrade_eligible: boolean;
  tradein_eligible: boolean;
  estimated_tradein_value_cents: number | null;
  usage_3m_avg_gb: number | null;
}

/**
 * Mock T-Mobile connector: pretends the persona signed in to their T-Mobile account and pulls it from the
 * T-Mobile hackathon sandbox API (GET /v1/customers/{id}/context and /billing) as one source, limited to
 * the scopes left checked. Body: { account?: persona folder (default alex-chen), scopes?: Scope[] }.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { account?: string; scopes?: string[] };
  const scopes = ALL_SCOPES.filter((s) => (body.scopes ?? ALL_SCOPES).includes(s));
  if (scopes.length === 0) return Response.json({ error: "Pick at least one thing to share" }, { status: 400 });

  // Only accept known persona folders, never a path from the request.
  const account = (await listAccounts()).find((a) => a.id === (body.account ?? "alex-chen"));
  if (!account) return Response.json({ error: "Unknown account" }, { status: 400 });
  const google = JSON.parse(await fs.readFile(path.join(SAMPLE_ROOT, account.id, "google_profile.json"), "utf8"));

  let data;
  try {
    data = await fetchAccount(TMOBILE_ACCOUNTS[account.id]);
  } catch (e) {
    return Response.json({ error: `Couldn't reach T-Mobile: ${(e as Error).message}` }, { status: 502 });
  }
  const ctx = data.context as { tenure_months: number; credit_tier: string; autopay: boolean; discount_group: string | null; lines: Line[] };

  const parts: string[] = [
    `T-Mobile account holder: ${account.name} <${account.email}>, phone number ${google.profile?.phone ?? "unknown"} (Line 1). Current carrier: T-Mobile.`,
  ];
  if (scopes.includes("account"))
    parts.push(
      `## T-Mobile account & plan\n${JSON.stringify(
        {
          customer_for_months: ctx.tenure_months,
          credit_tier: ctx.credit_tier,
          autopay: ctx.autopay,
          discount_group: ctx.discount_group,
          lines: ctx.lines.map((l) => ({
            line: l.member_label,
            role: l.member_role,
            plan: l.plan_name,
            data_cap_gb: l.plan_data_cap_gb,
            avg_monthly_data_gb: l.usage_3m_avg_gb,
          })),
        },
        null,
        2,
      )}`,
    );
  if (scopes.includes("devices"))
    parts.push(
      `## T-Mobile phones\n${JSON.stringify(
        ctx.lines.map((l) => ({
          line: l.member_label,
          device: l.device?.name ?? (l.byod ? "Bring your own phone" : null),
          purchased: l.device?.purchase_date,
          financing: l.financing && {
            paid_off: l.financing.paid_off,
            balance: dollars(l.financing.balance_cents),
            monthly_installment: dollars(l.financing.monthly_installment_cents),
            months_remaining: l.financing.months_remaining,
          },
          protection: l.has_protection,
          upgrade_eligible: l.upgrade_eligible,
          estimated_trade_in_value: dollars(l.estimated_tradein_value_cents),
        })),
        null,
        2,
      )}`,
    );
  if (scopes.includes("billing"))
    parts.push(
      `## T-Mobile monthly bills\n${(data.billing as { month: string; total_cents: number }[])
        .map((b) => `${b.month}: ${dollars(b.total_cents)}`)
        .join("\n")}`,
    );

  db.prepare("DELETE FROM sources WHERE connector = 'tmobile'").run();
  db.prepare("INSERT INTO sources (id, connector, name, mime, text, created_at) VALUES (?, 'tmobile', ?, ?, ?, ?)").run(
    nanoid(),
    `T-Mobile (${scopes.map((s) => LABELS[s]).join(", ")})`,
    "text/plain",
    parts.join("\n\n"),
    Date.now(),
  );

  try {
    return Response.json({ twin: await rebuildTwin() });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
