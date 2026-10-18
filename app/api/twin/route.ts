import { connection } from "next/server";
import { clearOverride, getTwin, rebuildTwin, setOverride } from "@/lib/twin";
import type { FactAction } from "@/lib/types";
import { currentUser } from "@/lib/user";

export async function GET(req: Request) {
  await connection();
  return Response.json({ twin: getTwin(currentUser(req)) });
}

/** Rebuild from the saved sources, e.g. the "Build my twin" retry after a failed rebuild. */
export async function POST(req: Request) {
  try {
    return Response.json({ twin: await rebuildTwin(currentUser(req)) });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}

/** Remove, edit or permanently censor one fact: { label, action, value? }. */
export async function PATCH(req: Request) {
  const user = currentUser(req);
  const { label, action, value } = (await req.json()) as { label?: string; action?: FactAction; value?: string };
  if (!label || !action || !["remove", "edit", "censor"].includes(action))
    return Response.json({ error: "label and action are required" }, { status: 400 });
  if (action === "edit" && !value?.trim()) return Response.json({ error: "value is required" }, { status: 400 });
  setOverride(user, label, action, action === "edit" ? value!.trim() : null);
  return Response.json({ twin: getTwin(user) });
}

/** Undo a remove or edit (censoring is permanent). */
export async function DELETE(req: Request) {
  const user = currentUser(req);
  const label = new URL(req.url).searchParams.get("label");
  if (!label) return Response.json({ error: "label is required" }, { status: 400 });
  const existing = getTwin(user)?.overrides.find((o) => o.label === label.toLowerCase());
  if (existing?.action === "censor") return Response.json({ error: "Censored facts can't be restored" }, { status: 400 });
  clearOverride(user, label);
  return Response.json({ twin: getTwin(user) });
}
