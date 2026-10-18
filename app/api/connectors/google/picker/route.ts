import { connection } from "next/server";
import { googleAccessToken, googleConfigured, googleConnection, importPickedFiles, pickerConfigured } from "@/lib/google";
import { rebuildTwin } from "@/lib/twin";
import { currentUser } from "@/lib/user";

/**
 * What the browser needs to open the Google Picker for this visitor: the browser API key, the Cloud
 * project number and the visitor's own (drive.file) access token. Never another visitor's token.
 */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  if (!googleConfigured() || !pickerConfigured()) return Response.json({ error: "The Google Picker isn't set up" }, { status: 400 });
  if (!googleConnection(user)) return Response.json({ error: "Connect your Google account first" }, { status: 400 });
  try {
    return Response.json(
      { apiKey: process.env.GOOGLE_API_KEY, appId: process.env.GOOGLE_APP_ID, token: await googleAccessToken(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }
}

/** The files the visitor picked: { fileIds: string[] } → downloaded with their token, read, twin rebuilt. */
export async function POST(req: Request) {
  const user = currentUser(req);
  if (!googleConnection(user)) return Response.json({ error: "Connect your Google account first" }, { status: 400 });
  const { fileIds } = (await req.json().catch(() => ({}))) as { fileIds?: unknown };
  const ids = Array.isArray(fileIds) ? fileIds.filter((id): id is string => typeof id === "string") : [];
  if (ids.length === 0) return Response.json({ error: "Pick at least one file" }, { status: 400 });

  let result: { added: number; errors: string[] };
  try {
    result = await importPickedFiles(user, ids);
  } catch (e) {
    return Response.json({ error: `Couldn't read those files: ${(e as Error).message}` }, { status: 502 });
  }
  if (result.added === 0) return Response.json({ error: `Couldn't read those files. ${result.errors.join("; ")}` }, { status: 422 });
  try {
    return Response.json({ twin: await rebuildTwin(user), errors: result.errors });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}`, errors: result.errors }, { status: 500 });
  }
}
