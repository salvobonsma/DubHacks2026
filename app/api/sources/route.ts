import { nanoid } from "nanoid";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { expandZips, extractText } from "@/lib/extract";
import { listSources, rebuildTwin } from "@/lib/twin";

export async function GET(req: Request) {
  await connection();
  // ?id= returns one source with its full text, for the source viewer.
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const source = listSources().find((s) => s.id === id);
    return source ? Response.json(source) : Response.json({ error: "Not found" }, { status: 404 });
  }
  // Connectors bundle several documents into one source under "## <section>" headings, and the
  // twin often cites a section ("Drive: Resume.docx") rather than the source name.
  return Response.json(
    listSources().map(({ text, ...s }) => ({
      ...s,
      chars: text.length,
      sections: [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()),
    })),
  );
}

/** Upload connector: multipart files (zips unpacked) -> raw text -> rebuild the digital twin. */
export async function POST(req: Request) {
  const form = await req.formData();
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) return Response.json({ error: "No files" }, { status: 400 });

  const insert = db.prepare(
    "INSERT INTO sources (id, connector, name, mime, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const { files, errors } = await expandZips(
    await Promise.all(
      uploads.map(async (f) => ({ name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) })),
    ),
  );
  await Promise.all(
    files.map(async (file) => {
      try {
        const text = await extractText(file.name, file.type, file.data);
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
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const connector = params.get("connector");
  if (id) db.prepare("DELETE FROM sources WHERE id = ?").run(id);
  else if (connector) db.prepare("DELETE FROM sources WHERE connector = ?").run(connector);
  else {
    db.prepare("DELETE FROM sources").run();
    db.prepare("DELETE FROM fact_overrides").run();
  }
  try {
    return Response.json({ twin: await rebuildTwin() });
  } catch (e) {
    return Response.json({ error: `Couldn't update your twin: ${(e as Error).message}` }, { status: 500 });
  }
}
