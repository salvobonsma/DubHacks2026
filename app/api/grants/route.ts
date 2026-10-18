import { connection } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";

const MODE_KEY = "__mode";

/** Per-business sharing mode + "always allow" grants, for this visitor only. */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  const business = new URL(req.url).searchParams.get("business") ?? "";
  const rows = db.prepare("SELECT key, decision FROM grants WHERE user_id = ? AND business = ?").all(user, business) as {
    key: string;
    decision: string;
  }[];
  return Response.json({
    mode: rows.find((r) => r.key === MODE_KEY)?.decision ?? "auto",
    always: rows.filter((r) => r.key !== MODE_KEY && r.decision === "allow").map((r) => r.key),
  });
}

export async function POST(req: Request) {
  const user = currentUser(req);
  const { business, key, decision, mode } = (await req.json()) as {
    business: string;
    key?: string;
    decision?: string;
    mode?: string;
  };
  if (!business) return Response.json({ error: "business is required" }, { status: 400 });
  const upsert = db.prepare(
    `INSERT INTO grants (user_id, business, key, decision, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, business, key) DO UPDATE SET decision = excluded.decision`,
  );
  if (mode) upsert.run(user, business, MODE_KEY, mode, Date.now());
  if (key && decision) upsert.run(user, business, key, decision, Date.now());
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = currentUser(req);
  const business = new URL(req.url).searchParams.get("business");
  if (business) db.prepare("DELETE FROM grants WHERE user_id = ? AND business = ?").run(user, business);
  else db.prepare("DELETE FROM grants WHERE user_id = ?").run(user);
  return Response.json({ ok: true });
}
