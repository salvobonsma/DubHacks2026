import { db } from "@/lib/db";
import { fillForm } from "@/lib/llm";
import { getTwin } from "@/lib/twin";
import type { FormSchema } from "@/lib/types";
import { currentUser, ownSession } from "@/lib/user";

/**
 * Stage 3: this visitor's twin + critical info + the business's blank form -> filled values and suggestions.
 * Only the session's owner can fill it, and only from their own twin.
 */
export async function POST(req: Request) {
  const user = currentUser(req);
  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
  if (!sessionId || !ownSession(sessionId, user)) return Response.json({ error: "Session not found" }, { status: 404 });
  const row = db.prepare("SELECT schema_json FROM sessions WHERE id = ?").get(sessionId) as
    | { schema_json: string }
    | undefined;
  if (!row) return Response.json({ error: "Session not found" }, { status: 404 });
  const twin = getTwin(user);
  if (!twin) return Response.json({ error: "Connect a data source first" }, { status: 400 });

  const schema = JSON.parse(row.schema_json) as FormSchema;
  try {
    return Response.json({ fields: await fillForm(schema, twin.critical, twin.markdown) });
  } catch (e) {
    return Response.json({ error: `Fill failed: ${(e as Error).message}` }, { status: 500 });
  }
}
