import { connection } from "next/server";
import { db } from "@/lib/db";
import { deleteLogins, deleteVault, ImportError, loginCount, MANAGER_NAMES, MAX_BYTES, parseExport, saveImport } from "@/lib/passwordManager";
import { getTwin, rebuildTwin } from "@/lib/twin";
import { currentUser, UID_COOKIE, UID_PATTERN } from "@/lib/user";
import { WipedError } from "@/lib/wipes";

/**
 * Password-manager import (lib/passwordManager.ts). The file is read into memory, parsed and dropped: it is never
 * written to disk, logged, or sent to Gemini, and no response carries a password. proxy.ts skips this route so a
 * 20 MB export isn't cut at the proxy's 10 MB body buffer; the formly_uid cookie set on the page load is required.
 */

const noStore = { "Cache-Control": "no-store" };
/** The file cap plus room for the multipart boundaries and headers. */
const LIMIT = MAX_BYTES + 64 * 1024;

function hasCookie(req: Request) {
  const id = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${UID_COOKIE}=([^;]+)`))?.[1];
  return !!id && UID_PATTERN.test(id);
}

/** { logins: N saved logins, vault: name of the imported 1Password / Bitwarden source or null }. */
export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  const vault = db.prepare("SELECT name FROM sources WHERE user_id = ? AND connector = 'password-manager'").get(user) as
    | { name: string }
    | undefined;
  return Response.json({ logins: loginCount(user), vault: vault?.name ?? null }, { headers: noStore });
}

/** Multipart `file`: a .1pux, Bitwarden .json / .csv, or Apple Passwords / Chrome .csv. Then the twin is rebuilt. */
export async function POST(req: Request) {
  if (!hasCookie(req)) return Response.json({ error: "Reload the page and try again." }, { status: 400 });
  const user = currentUser(req);
  const started = Date.now();
  const tooBig = () => Response.json({ error: "That file is over 20 MB. Export without attachments and try again." }, { status: 413 });
  if (Number(req.headers.get("content-length")) > LIMIT) return tooBig();
  // The header is only a fast path: a chunked upload has none. Count the bytes as they arrive and stop reading at the
  // cap, so nothing larger is ever buffered (proxy.ts skips this route, so its body limit doesn't apply here).
  let seen = 0;
  const counted = req.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > LIMIT) controller.error(new Error("too large"));
        else controller.enqueue(chunk);
      },
    }),
  );
  let file: File | null = null;
  try {
    const form = await new Response(counted ?? null, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    if (seen > LIMIT) return tooBig();
    return Response.json({ error: "Couldn't read the upload. Try again." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return tooBig();

  let summary: { manager: string; kind: "vault" | "logins"; items: number };
  try {
    const parsed = parseExport(file.name, Buffer.from(await file.arrayBuffer()));
    summary = {
      manager: MANAGER_NAMES[parsed.manager],
      kind: parsed.kind,
      items: parsed.kind === "vault" ? parsed.items : parsed.logins.length,
    };
    if (!saveImport(user, parsed, started)) return Response.json({ error: new WipedError().message }, { status: 409 });
  } catch (e) {
    // Only our own messages reach the client; anything else could quote the file, so it gets a generic line.
    const message = e instanceof ImportError ? e.message : "Couldn't read that export. Check it's the right file and try again.";
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    return Response.json({ twin: await rebuildTwin(user), ...summary, logins: loginCount(user) }, { headers: noStore });
  } catch (e) {
    return Response.json(
      { error: `Imported, but couldn't update your twin: ${(e as Error).message}`, ...summary, logins: loginCount(user) },
      { status: 500 },
    );
  }
}

/** ?what=logins: saved logins + their summary source. ?what=vault: the 1Password / Bitwarden source. Neither: both. */
export async function DELETE(req: Request) {
  const user = currentUser(req);
  const what = new URL(req.url).searchParams.get("what");
  let changed = 0;
  if (what !== "vault") changed += deleteLogins(user);
  if (what !== "logins") changed += deleteVault(user);
  try {
    return Response.json({ twin: changed ? await rebuildTwin(user, { removed: true }) : getTwin(user), logins: loginCount(user) });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}`, logins: 0 }, { status: 500 });
  }
}
