import { connection } from "next/server";
import { getTwin, rebuildTwin } from "@/lib/twin";

export async function GET() {
  await connection();
  return Response.json({ twin: getTwin() });
}

export async function POST() {
  return Response.json({ twin: await rebuildTwin() });
}
