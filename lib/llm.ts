import { GoogleGenAI, Type, type Part } from "@google/genai";
import type { CriticalFact, FilledField, FormSchema } from "./types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const FILL_MODEL = process.env.GEMINI_FILL_MODEL ?? MODEL;

let client: GoogleGenAI | null = null;
function ai() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

/** Stage 1 helper: transcribe a PDF or image into plain text. */
export async function transcribeFile(name: string, mime: string, data: Buffer): Promise<string> {
  const parts: Part[] = [
    { inlineData: { mimeType: mime, data: data.toString("base64") } },
    {
      text: `Transcribe every piece of personal information in this document ("${name}") as plain text.
Keep labels next to values (e.g. "Date of birth: 1998-04-12"). Include all names, numbers, dates,
addresses, IDs and amounts exactly as written. Output only the transcription.`,
    },
  ];
  const res = await ai().models.generateContent({ model: MODEL, contents: [{ role: "user", parts }] });
  return res.text?.trim() ?? "";
}

/** Stage 2a: merge all raw source texts into the markdown digital twin. */
export async function buildTwinMarkdown(sources: { name: string; text: string }[]): Promise<string> {
  const corpus = sources.map((s) => `### SOURCE: ${s.name}\n${s.text}`).join("\n\n");
  const res = await ai().models.generateContent({
    model: MODEL,
    contents: `You maintain a user's "digital twin": a concise markdown profile of everything known about them.
Merge the sources below into one profile with these sections (omit empty ones):
## Identity, ## Contact, ## Addresses, ## IDs & Documents, ## Employment & Income, ## Financial, ## People, ## Preferences & Plans
Use bullet points "- **Label:** value _(source: filename)_". When sources conflict, prefer the most recent/official
document and note the conflict. Never invent information. Output only markdown.

${corpus}`,
  });
  return res.text?.trim() ?? "";
}

/** Stage 2b: pull typed critical facts out of the twin. */
export async function extractCriticalInfo(twinMarkdown: string): Promise<CriticalFact[]> {
  const res = await ai().models.generateContent({
    model: MODEL,
    contents: `From this digital twin, extract every discrete fact useful for filling out forms
(names, DOB, contact, each address part, ID numbers/state/expiry, SSN, employer, title, income, housing cost,
card details, emergency contacts, current carrier, preferences, etc.).
key: snake_case identifier. sensitivity: "sensitive" for SSN, full card numbers, CVV, ID numbers, passwords;
"personal" for DOB, income, employer, phone, family members; "basic" for name, email, address, preferences.

${twinMarkdown}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            key: { type: Type.STRING },
            label: { type: Type.STRING },
            value: { type: Type.STRING },
            source: { type: Type.STRING },
            sensitivity: { type: Type.STRING, enum: ["basic", "personal", "sensitive"] },
          },
          required: ["key", "label", "value", "source", "sensitivity"],
        },
      },
    },
  });
  return JSON.parse(res.text ?? "[]");
}

/** Stage 3: critical info + twin + business form schema -> field values. */
export async function fillForm(
  schema: FormSchema,
  critical: CriticalFact[],
  twinMarkdown: string,
): Promise<FilledField[]> {
  const fields = schema.fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    ...(f.options ? { options: f.options } : {}),
  }));
  const res = await ai().models.generateContent({
    model: FILL_MODEL,
    contents: `Fill out ${schema.business}'s form "${schema.title}" for the user, using ONLY the user's data below.
Rules:
- Return one entry per form field id.
- Format values for the field type: date -> YYYY-MM-DD, tel -> (555) 555-5555, number -> digits only,
  select -> exactly one of the listed options.
- If the data does not contain the answer, value must be null. Never guess or invent.
- source: the filename the value came from. confidence: 0-1.

FORM FIELDS:
${JSON.stringify(fields)}

CRITICAL INFO:
${JSON.stringify(critical)}

FULL DIGITAL TWIN:
${twinMarkdown}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            fieldId: { type: Type.STRING },
            value: { type: Type.STRING, nullable: true },
            source: { type: Type.STRING, nullable: true },
            confidence: { type: Type.NUMBER },
          },
          required: ["fieldId", "value", "source", "confidence"],
        },
      },
    },
  });
  const out: FilledField[] = JSON.parse(res.text ?? "[]");
  const valid = new Set(schema.fields.map((f) => f.id));
  return out.filter((f) => valid.has(f.fieldId));
}
