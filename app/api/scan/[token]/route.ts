import { nanoid } from "nanoid";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { extractText } from "@/lib/extract";
import {
  claimScan,
  finishScan,
  releaseScan,
  SCAN_MAX_BYTES,
  SCAN_MAX_FILES,
  SCAN_MAX_REQUEST_BYTES,
  scanFileType,
  scanOwner,
  scanState,
} from "@/lib/scan";
import { rebuildTwin } from "@/lib/twin";
import { purgeExpired } from "@/lib/user";
import { WipedError, wipedSince } from "@/lib/wipes";

/** Desktop polls this while the QR code is up. */
export async function GET(_req: Request, ctx: RouteContext<"/api/scan/[token]">) {
  await connection();
  const { token } = await ctx.params;
  const { state, files, twinError } = scanState(token);
  if (state === "missing") return Response.json({ error: "Unknown scan link" }, { status: 404 });
  if (state === "expired") return Response.json({ error: "This scan link expired" }, { status: 410 });
  // "receiving" is still waiting as far as the contract goes; the flag lets the desktop say the phone is sending.
  // twinError (extra) says the files were saved but the twin rebuild failed, so the desktop can say so.
  return Response.json({
    status: state === "received" ? "received" : "waiting",
    files,
    receiving: state === "receiving",
    ...(twinError ? { twinError } : {}),
  });
}

// iOS and Android name every camera shot the same, so give those a readable name in the source list.
const GENERIC_NAME = /^(image|photo|img[_-]?\d*|pxl_[\d_]+|\d+)\.\w+$/i;

/**
 * Phone upload: multipart `files` -> raw text -> sources (connector "scan") -> rebuild the twin.
 * The files land in the sources of the visitor who showed the QR code (the token's owner), never the
 * phone's own formly_uid: the phone is another browser. The token is single use. The phone page posts with fetch, or as a plain form when its JS didn't load,
 * in which case we answer with a redirect back to the page instead of JSON.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/scan/[token]">) {
  const { token } = await ctx.params;
  purgeExpired();
  const html = req.headers.get("accept")?.includes("text/html") ?? false;
  const reply = (body: { error?: string; files?: number; errors?: string[] }, status = 200) =>
    html
      ? new Response(null, {
          status: 303,
          headers: {
            Location: `/formly/scan/${token}?${body.error ? `error=${encodeURIComponent(body.error)}` : `done=${body.files ?? 0}`}`,
          },
        })
      : Response.json(body, { status });

  // Everything below runs before the body is read, since formData() buffers the whole upload in memory.
  const closed = scanState(token).state;
  if (closed !== "waiting") return reply({ error: usedMessage(closed) }, closed === "missing" ? 404 : 410);
  const length = Number(req.headers.get("content-length"));
  if (!length || length > SCAN_MAX_REQUEST_BYTES) {
    return reply(
      { error: `Send at most ${SCAN_MAX_FILES} files, each under ${SCAN_MAX_BYTES / 1024 / 1024} MB` },
      length ? 413 : 411,
    );
  }

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return reply({ error: "Take or pick at least one photo" }, 400);
  if (files.length > SCAN_MAX_FILES) return reply({ error: `Send at most ${SCAN_MAX_FILES} files at a time` }, 400);

  const owner = scanOwner(token);
  if (!owner || !claimScan(token)) {
    const { state } = scanState(token);
    return reply({ error: usedMessage(state) }, state === "missing" ? 404 : 410);
  }

  const insert = db.prepare(
    "INSERT INTO sources (id, user_id, connector, name, mime, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const started = Date.now();
  // The desktop's owner deleted their data (or a wipe took the scan link) while a photo was being read.
  const wiped = () => wipedSince(owner, started) || scanOwner(token) !== owner;
  const errors: string[] = [];
  const day = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  let inserted = 0;
  await Promise.all(
    files.map(async (file, i) => {
      if (file.size > SCAN_MAX_BYTES) {
        errors.push(`${file.name}: larger than ${SCAN_MAX_BYTES / 1024 / 1024} MB`);
        return;
      }
      // Only photos and PDFs: the page's accept= is a browser hint, and a text or JSON file here would go
      // to the twin (and the LLM) raw.
      const mime = scanFileType(file.name, file.type);
      if (!mime) {
        errors.push(`${file.name}: only photos and PDFs can be scanned`);
        return;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const name = GENERIC_NAME.test(file.name) ? `Phone photo ${i + 1}${ext ? `.${ext}` : ""}` : file.name;
      try {
        const text = await extractText(file.name, mime, Buffer.from(await file.arrayBuffer()));
        if (wiped()) return;
        insert.run(nanoid(), owner, "scan", name, mime, `Phone scan, ${day}: ${name}\n\n${text}`, Date.now());
        inserted++;
      } catch (e) {
        errors.push(`${file.name}: ${(e as Error).message}`);
      }
    }),
  );

  // Files read before the wipe went with it; the check and each insert run with no await between them.
  if (wiped()) return reply({ error: new WipedError().message }, 410);
  if (inserted === 0) {
    releaseScan(token);
    return reply({ error: `Couldn't read ${files.length > 1 ? "those files" : "that file"}. ${errors.join("; ")}`, errors }, 422);
  }

  // Received only flips after the rebuild, so the desktop's refresh picks up the new twin.
  let twinError: string | undefined;
  try {
    await rebuildTwin(owner);
    return reply({ files: inserted, errors });
  } catch (e) {
    // The files are saved either way; the twin catches up on the next rebuild.
    twinError = `Couldn't update your twin: ${(e as Error).message}`;
    return reply({ files: inserted, errors: [...errors, twinError] });
  } finally {
    finishScan(token, inserted, twinError);
  }
}

function usedMessage(state: string) {
  return state === "received" || state === "receiving"
    ? "This link was already used. Scan a new code on your computer."
    : state === "missing"
      ? "This link isn't valid. Scan the code on your computer again."
      : "This link expired. Scan a new code on your computer.";
}
