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
