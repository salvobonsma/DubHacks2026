import Anthropic from "@anthropic-ai/sdk";
import type { GenerateContentParameters } from "@google/genai";

/**
 * Runs Formly's Gemini-shaped requests on Claude, so every prompt and schema in lib/llm.ts stays as written.
 * Used whenever ANTHROPIC_API_KEY is set (no free-tier daily caps). Returns `{ text }` like a Gemini response.
 */
const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
// Extraction and filling are lookups, not open-ended reasoning: low effort keeps a fill to a few seconds.
const EFFORT = (process.env.CLAUDE_EFFORT ?? "low") as "low" | "medium" | "high";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export const claudeConfigured = () => !!process.env.ANTHROPIC_API_KEY;

type GeminiSchema = {
  type?: string;
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
  enum?: string[];
  nullable?: boolean;
  description?: string;
};

/** Gemini's OpenAPI-style schema (Type.OBJECT, nullable) as JSON Schema for Claude structured outputs. */
function toJsonSchema(s: GeminiSchema): Record<string, unknown> {
  const t = String(s.type ?? "string").toLowerCase();
  const out: Record<string, unknown> = {};
  if (t === "object") {
    out.type = "object";
    out.properties = Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, toJsonSchema(v)]));
    out.required = s.required ?? Object.keys(s.properties ?? {});
    out.additionalProperties = false;
  } else if (t === "array") {
    out.type = "array";
    out.items = toJsonSchema(s.items ?? {});
  } else {
    out.type = t === "number" || t === "integer" || t === "boolean" ? t : "string";
    if (s.enum) out.enum = s.nullable ? [...s.enum, null] : s.enum;
  }
  if (s.nullable) out.type = [out.type as string, "null"];
  if (s.description) out.description = s.description;
  return out;
}

type Part = { text?: string; inlineData?: { mimeType?: string; data?: string } };

function toContent(contents: GenerateContentParameters["contents"]): Anthropic.ContentBlockParam[] {
  if (typeof contents === "string") return [{ type: "text", text: contents }];
  const parts: Part[] = (Array.isArray(contents) ? contents : [contents]).flatMap((c) =>
    typeof c === "string" ? [{ text: c }] : "parts" in (c as object) ? ((c as { parts?: Part[] }).parts ?? []) : [c as Part],
  );
  return parts.flatMap((p): Anthropic.ContentBlockParam[] => {
    if (p.text) return [{ type: "text", text: p.text }];
    const mime = p.inlineData?.mimeType ?? "";
    const data = p.inlineData?.data ?? "";
    if (mime === "application/pdf") return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }];
    if (/^image\/(jpeg|png|gif|webp)$/.test(mime))
      return [{ type: "image", source: { type: "base64", media_type: mime as "image/png", data } }];
    throw new Error(`Claude can't read ${mime || "this file type"}; use a PDF, JPG, PNG, GIF or WebP`);
  });
}

export async function claudeGenerate(params: GenerateContentParameters): Promise<{ text: string }> {
  const schema = params.config?.responseSchema as GeminiSchema | undefined;
  // Structured outputs need an object at the top; Gemini schemas here are often arrays, so wrap and unwrap.
  const wrapArray = schema && String(schema.type).toLowerCase() === "array";
  const jsonSchema = schema
    ? wrapArray
      ? { type: "object", properties: { items: toJsonSchema(schema) }, required: ["items"], additionalProperties: false }
      : toJsonSchema(schema)
    : undefined;

  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: toContent(params.contents) }],
    output_config: { effort: EFFORT, ...(jsonSchema ? { format: { type: "json_schema", schema: jsonSchema } } : {}) },
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined to process this content");
  if (res.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off");
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!wrapArray) return { text };
  return { text: JSON.stringify((JSON.parse(text) as { items: unknown[] }).items) };
}
