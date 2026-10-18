import { nanoid } from "nanoid";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { extractText } from "@/lib/extract";
import { listSources, rebuildTwin } from "@/lib/twin";

export async function GET(req: Request) {
  await connection();
  // ?id= returns one source with its full text, for the source viewer.
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const source = listSources().find((s) => s.id === id);
    return source ? Response.json(source) : Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(listSources().map(({ text, ...s }) => ({ ...s, chars: text.length })));
}

/** Upload connector: multipart files -> raw text -> rebuild the digital twin. */
export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "No files" }, { status: 400 });

  const insert = db.prepare(
    "INSERT INTO sources (id, connector, name, mime, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const errors: string[] = [];
  await Promise.all(
    files.map(async (file) => {
      try {
        const text = await extractText(file.name, file.type, Buffer.from(await file.arrayBuffer()));
        insert.run(nanoid(), "upload", file.name, file.type || null, text, Date.now());
      } catch (e) {
        errors.push(`${file.name}: ${(e as Error).message}`);
      }
    }),
  );

  try {
    return Response.json({ twin: await rebuildTwin(), errors });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}`, errors }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) db.prepare("DELETE FROM sources WHERE id = ?").run(id);
  else db.prepare("DELETE FROM sources").run();
  try {
    return Response.json({ twin: await rebuildTwin() });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
