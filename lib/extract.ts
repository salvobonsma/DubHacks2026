import JSZip from "jszip";
import mammoth from "mammoth";
import { transcribeFile } from "./llm";

const TEXT_EXT = /\.(txt|md|json|csv|tsv)$/i;
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
};

/** File types extractText can read, by extension. */
export function isSupported(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXT.test(name) || ext === "docx" || ext === "pdf" || ext in IMAGE_MIME;
}

export interface UploadFile {
  name: string;
  type: string;
  data: Buffer;
}

const ZIP_MAX_FILES = 50;
const ZIP_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Replace each .zip with the supported files inside it (folders flattened, Mac metadata and
 * nested zips skipped). Caps on file count and unpacked size keep a zip bomb from running away.
 */
export async function expandZips(files: UploadFile[]): Promise<{ files: UploadFile[]; errors: string[] }> {
  const out: UploadFile[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name) && file.type !== "application/zip") {
      out.push(file);
      continue;
    }
    try {
      const zip = await JSZip.loadAsync(file.data);
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && !e.name.startsWith("__MACOSX/") && !e.name.split("/").pop()!.startsWith(".") && isSupported(e.name),
      );
      if (!entries.length) {
        errors.push(`${file.name}: no supported files inside`);
        continue;
      }
      if (entries.length > ZIP_MAX_FILES) {
        errors.push(`${file.name}: only the first ${ZIP_MAX_FILES} of ${entries.length} files were read`);
      }
      let bytes = 0;
      for (const entry of entries.slice(0, ZIP_MAX_FILES)) {
        const data = await entry.async("nodebuffer");
        bytes += data.length;
        if (bytes > ZIP_MAX_BYTES) {
          errors.push(`${file.name}: too large to unpack, stopped at ${entry.name}`);
          break;
        }
        out.push({ name: entry.name.split("/").pop()!, type: "", data });
      }
    } catch {
      errors.push(`${file.name}: couldn't open the zip`);
    }
  }
  return { files: out, errors };
}

/** Stage 1: turn any supported upload into plain text. */
export async function extractText(name: string, mime: string, data: Buffer): Promise<string> {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (TEXT_EXT.test(name) || mime.startsWith("text/")) {
    const raw = data.toString("utf8");
    if (ext === "json") {
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: data });
    return value;
  }

  if (ext === "pdf" || mime === "application/pdf") {
    return transcribeFile(name, "application/pdf", data);
  }

  const imageMime = mime.startsWith("image/") ? mime : IMAGE_MIME[ext];
  if (imageMime) return transcribeFile(name, imageMime, data);

  throw new Error(`Unsupported file type: ${name}`);
}
