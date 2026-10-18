import { nanoid } from "nanoid";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { extractText } from "@/lib/extract";
import { deleteLogins } from "@/lib/passwordManager";
import { listSources, rebuildTwin } from "@/lib/twin";
import { currentUser } from "@/lib/user";
import { WipedError, wipedSince } from "@/lib/wipes";

export async function GET(req: Request) {
  await connection();
  const user = currentUser(req);
  // ?id= returns one source with its full text, for the source viewer.
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const source = listSources(user).find((s) => s.id === id);
    return source ? Response.json(source) : Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(listSources(user).map(({ text, ...s }) => ({ ...s, chars: text.length })));
}

/** Upload connector: multipart files -> raw text -> rebuild the digital twin. */
export async function POST(req: Request) {
  const user = currentUser(req);
  const started = Date.now();
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "No files" }, { status: 400 });

  const insert = db.prepare(
    "INSERT INTO sources (id, user_id, connector, name, mime, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const errors: string[] = [];
  await Promise.all(
    files.map(async (file) => {
      try {
        const text = await extractText(file.name, file.type, Buffer.from(await file.arrayBuffer()));
        // "Delete my data" while this file was being read: don't write it back.
        if (wipedSince(user, started)) return;
        insert.run(nanoid(), user, "upload", file.name, file.type || null, text, Date.now());
      } catch (e) {
        errors.push(`${file.name}: ${(e as Error).message}`);
      }
    }),
  );
  if (wipedSince(user, started)) return Response.json({ error: new WipedError().message }, { status: 409 });

  try {
    return Response.json({ twin: await rebuildTwin(user), errors });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}`, errors }, { status: 500 });
  }
}

/** ?id= one source, ?connector= all of one connector's, neither = all of this visitor's sources and edits. */
export async function DELETE(req: Request) {
  const user = currentUser(req);
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const connector = params.get("connector");
  // The saved-logins summary goes with the encrypted logins it was made from, so "Remove" leaves no passwords behind.
  const isLogins =
    connector === "passwords" ||
    (!!id && !!db.prepare("SELECT 1 FROM sources WHERE user_id = ? AND id = ? AND connector = 'passwords'").get(user, id));
  if (id) db.prepare("DELETE FROM sources WHERE user_id = ? AND id = ?").run(user, id);
  else if (connector) db.prepare("DELETE FROM sources WHERE user_id = ? AND connector = ?").run(user, connector);
  else {
    db.prepare("DELETE FROM sources WHERE user_id = ?").run(user);
    db.prepare("DELETE FROM fact_overrides WHERE user_id = ?").run(user);
  }
  if (isLogins || (!id && !connector)) deleteLogins(user);
  try {
    return Response.json({ twin: await rebuildTwin(user, { removed: true }) });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
