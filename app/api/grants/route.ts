import { connection } from "next/server";
import { db } from "@/lib/db";

const MODE_KEY = "__mode";

/** Per-business sharing mode + "always allow" grants. */
export async function GET(req: Request) {
  await connection();
  const business = new URL(req.url).searchParams.get("business") ?? "";
  const rows = db.prepare("SELECT key, decision FROM grants WHERE business = ?").all(business) as {
    key: string;
    decision: string;
  }[];
  return Response.json({
    mode: rows.find((r) => r.key === MODE_KEY)?.decision ?? "auto",
    always: rows.filter((r) => r.key !== MODE_KEY && r.decision === "allow").map((r) => r.key),
  });
}

export async function POST(req: Request) {
  const { business, key, decision, mode } = (await req.json()) as {
    business: string;
    key?: string;
    decision?: string;
    mode?: string;
  };
  const upsert = db.prepare(
    `INSERT INTO grants (business, key, decision) VALUES (?, ?, ?)
     ON CONFLICT(business, key) DO UPDATE SET decision = excluded.decision`,
  );
  if (mode) upsert.run(business, MODE_KEY, mode);
  if (key && decision) upsert.run(business, key, decision);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const business = new URL(req.url).searchParams.get("business");
  if (business) db.prepare("DELETE FROM grants WHERE business = ?").run(business);
  else db.prepare("DELETE FROM grants").run();
  return Response.json({ ok: true });
}
