import { nanoid } from "nanoid";
import { connection } from "next/server";
import { db } from "@/lib/db";
import type { FormSchema } from "@/lib/types";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { headers: cors });
}

/** Business side: register the blank form schema and get a session for the popup. */
export async function POST(req: Request) {
  const { schema, origin } = (await req.json()) as { schema: FormSchema; origin?: string };
  if (!schema?.fields?.length) return Response.json({ error: "Invalid schema" }, { status: 400, headers: cors });
  const id = nanoid();
  db.prepare("INSERT INTO sessions (id, business, schema_json, origin, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    schema.business,
    JSON.stringify(schema),
    origin ?? null,
    Date.now(),
  );
  return Response.json({ sessionId: id }, { headers: cors });
}

export async function GET(req: Request) {
  await connection();
  const id = new URL(req.url).searchParams.get("id");
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | { id: string; business: string; schema_json: string; origin: string | null; status: string }
    | undefined;
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    id: row.id,
    business: row.business,
    origin: row.origin,
    status: row.status,
    schema: JSON.parse(row.schema_json),
  });
}
