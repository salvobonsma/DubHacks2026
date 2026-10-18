import { db } from "@/lib/db";
import { fillForm } from "@/lib/llm";
import { getTwin } from "@/lib/twin";
import type { FormSchema } from "@/lib/types";

/** Stage 3: twin + critical info + the business's blank form -> filled values. */
export async function POST(req: Request) {
  const { sessionId } = (await req.json()) as { sessionId: string };
  const row = db.prepare("SELECT schema_json FROM sessions WHERE id = ?").get(sessionId) as
    | { schema_json: string }
    | undefined;
  if (!row) return Response.json({ error: "Session not found" }, { status: 404 });
  const twin = getTwin();
  if (!twin) return Response.json({ error: "Connect a data source first" }, { status: 400 });

  const schema = JSON.parse(row.schema_json) as FormSchema;
  try {
    return Response.json({ fields: await fillForm(schema, twin.critical, twin.markdown) });
  } catch (e) {
    return Response.json({ error: `Fill failed: ${(e as Error).message}` }, { status: 500 });
  }
}
