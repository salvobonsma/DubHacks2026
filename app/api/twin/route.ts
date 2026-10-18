import { connection } from "next/server";
import { clearOverride, getTwin, rebuildTwin, setOverride } from "@/lib/twin";
import type { FactAction } from "@/lib/types";

export async function GET() {
  await connection();
  return Response.json({ twin: getTwin() });
}

export async function POST() {
  return Response.json({ twin: await rebuildTwin() });
}

/** Remove, edit or permanently censor one fact: { label, action, value? }. */
export async function PATCH(req: Request) {
  const { label, action, value } = (await req.json()) as { label?: string; action?: FactAction; value?: string };
  if (!label || !action || !["remove", "edit", "censor"].includes(action))
    return Response.json({ error: "label and action are required" }, { status: 400 });
  if (action === "edit" && !value?.trim()) return Response.json({ error: "value is required" }, { status: 400 });
  setOverride(label, action, action === "edit" ? value!.trim() : null);
  return Response.json({ twin: getTwin() });
}

/** Undo a remove or edit (censoring is permanent). */
export async function DELETE(req: Request) {
  const label = new URL(req.url).searchParams.get("label");
  if (!label) return Response.json({ error: "label is required" }, { status: 400 });
  const existing = getTwin()?.overrides.find((o) => o.label === label.toLowerCase());
  if (existing?.action === "censor") return Response.json({ error: "Censored facts can't be restored" }, { status: 400 });
  clearOverride(label);
  return Response.json({ twin: getTwin() });
}
