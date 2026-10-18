import { GoogleGenAI, ThinkingLevel, Type, type GenerateContentParameters, type Part } from "@google/genai";
import type { CriticalFact, FilledField, FormField, FormSchema } from "./types";
import { trimToWords } from "./words";
import { claudeConfigured, claudeGenerate } from "./claude";

// Flash-Lite with low thinking: ~3s fills, same accuracy as Flash on these extraction tasks.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const FILL_MODEL = process.env.GEMINI_FILL_MODEL ?? MODEL;
// Short answers are writing, not extraction, so they default to the bigger model.
const WRITE_MODEL = process.env.GEMINI_WRITE_MODEL ?? "gemini-3.5-flash";
// Tried in order when the primary model is overloaded (503) or rate limited (429).
const FALLBACKS = ["gemini-3.5-flash", "gemini-3-flash-preview"];

let client: GoogleGenAI | null = null;
function ai() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

/**
 * generateContent with low thinking (default thinking is ~7x slower for these extraction tasks)
 * and immediate fallback to the next model when one is overloaded or rate limited.
 */
async function generate(params: GenerateContentParameters) {
  // With an Anthropic key, every request runs on Claude instead (same prompts and schemas, no free-tier caps).
  // If Claude fails (no credits, rate limit, outage), fall through to Gemini so a fill still finishes.
  if (claudeConfigured()) {
    try {
      return (await claudeGenerate(params)) as never;
    } catch (e) {
      console.warn(`[formly] Claude failed, using Gemini: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  const models = [...new Set([params.model, ...FALLBACKS, MODEL])];
  const config = { ...params.config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  let lastErr: unknown;
  for (const model of models) {
    try {
      return await ai().models.generateContent({ ...params, model, config });
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number }).status;
      if (status !== 503 && status !== 429 && status !== 500) throw e;
      console.warn(`[formly] ${model} returned ${status}, falling back`);
    }
  }
  throw lastErr;
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
  const res = await generate({ model: MODEL, contents: [{ role: "user", parts }] });
  return res.text?.trim() ?? "";
}

/** Stage 2a: merge all raw source texts into the markdown digital twin. */
export async function buildTwinMarkdown(sources: { name: string; text: string }[]): Promise<string> {
  const corpus = sources.map((s) => `### SOURCE: ${s.name}\n${s.text}`).join("\n\n");
  const res = await generate({
    model: MODEL,
    contents: `You maintain a user's "digital twin": a concise markdown profile of everything known about them.
Merge the sources below into one profile using exactly these six headings, written as shown (omit empty ones):
## Personal
## Home & Vehicles
## IDs & Money
## Health
## Work & Education
## People & Plans
Personal: name (legal, preferred, previous names, suffix), birthday, birthplace, sex, citizenship, marital status,
email, phone, physical description (height, weight, eye and hair color), languages, voter registration, veteran
status, organ donor. Home & Vehicles: home address, county, mailing address, own or rent, move-in date, monthly
payment, landlord, previous addresses with dates, each vehicle (year, make, model, color, VIN, plate, registration),
auto and home or renters insurance. IDs & Money: SSN, driver's license or state ID (number, class, restrictions,
issue and expiry), passport, payment cards, bank accounts, tax filing status, dependents, income, credit, debts.
Health: health insurance (carrier, member ID, group number), doctors, pharmacy, allergies, medications, conditions,
blood type. Work & Education: each job (employer, address, phone, title, manager, dates, pay), schools, degrees,
majors, GPA, graduation dates, certifications, skills, and every project or accomplishment with its specifics kept
(what it was, the numbers, the tools). People & Plans: parents (names, birth dates, birthplaces, mother's maiden
name), spouse, children, emergency contacts, references, pets, current services and bills, interests, preferences,
plans. Keep every fact from the sources, however minor. Use flat bullets only, one fact per bullet.
Use bullet points "- **Label:** value _(source: filename)_". When sources conflict, prefer the most recent/official
document and note the conflict. Never invent information. Output only markdown.

${corpus}`,
  });
  return res.text?.trim() ?? "";
}

/** Stage 2b: pull typed critical facts out of the user's data (runs in parallel with 2a). */
export async function extractCriticalInfo(sources: { name: string; text: string }[]): Promise<CriticalFact[]> {
  const corpus = sources.map((s) => `### SOURCE: ${s.name}\n${s.text}`).join("\n\n");
  const res = await generate({
    model: MODEL,
    contents: `From the user's data below, extract every discrete fact useful for filling out forms
(names, DOB, birthplace, sex, contact, each address part, county, previous addresses, citizenship, height, weight,
eye and hair color, ID numbers/state/class/expiry, passport, SSN, mother's maiden name, parents, marital status,
vehicles (VIN, plate), insurance policies and member IDs, bank accounts, tax filing status, employer, title,
income, housing cost, landlord, school, degree, major, GPA, graduation year, skills, card details, emergency
contacts, references, allergies, medications, current carrier, preferences, etc.).
key: snake_case identifier. sensitivity: "sensitive" for SSN, full card numbers, CVV, ID numbers, bank account
numbers, mother's maiden name, insurance member IDs, passwords;
"personal" for DOB, income, employer, phone, family members; "basic" for name, email, address, preferences.
source: the SOURCE filename the fact came from. Never invent information.

${corpus}`,
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

const FILLED_FIELDS = {
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
};

/** Stage 3: critical info + twin + business form schema -> field values. Short answers are written separately. */
export async function fillForm(
  schema: FormSchema,
  critical: CriticalFact[],
  twinMarkdown: string,
): Promise<FilledField[]> {
  const essays = schema.fields.filter((f) => f.type === "textarea");
  const facts = schema.fields.filter((f) => f.type !== "textarea");
  const [filled, written] = await Promise.all([
    facts.length ? fillFacts(schema, facts, critical, twinMarkdown) : [],
    // A failed draft shouldn't sink the whole fill: the user can still write those answers in review.
    essays.length
      ? writeAnswers(schema, essays, critical, twinMarkdown).catch((e) => {
          console.warn(`[formly] short answers failed: ${(e as Error).message}`);
          return [];
        })
      : [],
  ]);
  const valid = new Set(schema.fields.map((f) => f.id));
  return [...filled, ...written].filter((f) => valid.has(f.fieldId));
}

async function fillFacts(
  schema: FormSchema,
  formFields: FormField[],
  critical: CriticalFact[],
  twinMarkdown: string,
): Promise<FilledField[]> {
  const fields = formFields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    ...(f.options ? { options: f.options } : {}),
  }));
  const res = await generate({
    model: FILL_MODEL,
    contents: `Fill out ${schema.business}'s form "${schema.title}" for the user, using ONLY the user's data below.
Today is ${new Date().toISOString().slice(0, 10)}.
Rules:
- Return one entry per form field id.
- Format values for the field type: date -> YYYY-MM-DD, tel -> (555) 555-5555, number -> digits only,
  select -> exactly one of the listed options.
- Ages and years of experience: work them out from the dates in the data, as of today.
- If the data explicitly says there is none (no lienholder, no apartment number, no suffix), that is an answer:
  use "None", or "N/A" if the data says N/A. For a select, pick the option that means none if there is one.
  Only when the data says so in words: an address that simply has no unit leaves the apartment/suite field null,
  never "None".
- If the data does not contain the answer, value must be null. Never guess or invent.
- source: the filename the value came from. confidence: 0-1.

FORM FIELDS:
${JSON.stringify(fields)}

CRITICAL INFO:
${JSON.stringify(critical)}

FULL DIGITAL TWIN:
${twinMarkdown}`,
    config: FILLED_FIELDS,
  });
  return JSON.parse(res.text ?? "[]");
}

/**
 * Stage 3b: write the form's short-answer questions in the user's own voice, from what their twin says
 * they've actually done. The user reviews every answer before it's sent.
 */
async function writeAnswers(
  schema: FormSchema,
  questions: FormField[],
  critical: CriticalFact[],
  twinMarkdown: string,
): Promise<FilledField[]> {
  const res = await generate({
    model: WRITE_MODEL,
    contents: `Draft the user's answers to the short-answer questions on ${schema.business}'s "${schema.title}".
Write as the user. They'll read each answer before it's sent, so write what they'd plausibly type themselves.
${schema.context ? `\nWhat ${schema.business} says about the role: ${schema.context}\n` : ""}
What to say:
- Every detail must come from the user's data below. First fill evidence with the exact phrases you'll draw on,
  copied word for word from the data. Then write the answer from those facts only, plus the plain connecting
  words anyone would use. Never add tools, numbers, causes, results or stories that aren't in the evidence.
- If the data has no real example for a question, evidence is [] and value is null. If it only supports a short
  answer, write a short answer. Padding with made-up detail is the one thing that must never happen.
- Pick the one best example for each question and tell it properly: what was going wrong, what they figured out,
  what they did, what changed. When the data has several, a problem they had to diagnose beats a planned project.
  Don't recap the resume, and use a different example for each question.
- For a "why us" question, connect one specific thing they've done or are into to one specific part of
  ${schema.business}'s work, and say what they'd actually want to work on. Their reason should follow from what
  they've chosen to do, said plainly. No flattery, no mission statements, no lifelong dreams.

How it should sound: like a real applicant, not a cover letter and not an AI.
- Write it the way they'd say it if a friendly engineer asked them in person, tightened up a bit. Connected
  sentences that flow, not a list of short facts. Don't start every sentence with "I".
- First person, plain words, contractions. A little informal is fine. Numbers as digits, the way people type them.
- Start with the substance. Don't restate the question or open with "I am" or "As a".
- Say the concrete thing, never the abstract version: no "my background in", "my experience with", "my skills
  translate", "aligns with".
- Don't close on a recap of what you just said, a lesson learned or a big line about the future. Stop when the
  story's done.
- Never use: passionate, thrilled, excited, eager, leverage, cutting-edge, innovative, synergy, delve, journey,
  tapestry, testament, landscape, realm, robust, seamless, pivotal, foster, spearhead, "I believe",
  "I'm confident", "Moreover", "Furthermore", "Additionally", "Ultimately".
- No em dashes, semicolons, exclamation marks, rhetorical questions or strings of three adjectives. Ordinary
  hyphens in compound words are fine (3-week, real-time).
- Length: aim for minWords to maxWords, never more. Get there by telling the example in more depth with more of
  the evidence (what was wrong, how they found it, what they changed, the result), never by adding detail. Only
  go shorter when the data really is that thin.

For tone only (a different person, so don't reuse any of this content):
Too polished: "I am passionate about leveraging my expertise in distributed systems to drive innovation. In my
previous role, I spearheaded a robust caching solution that significantly improved performance."
Sounds like a person: "Our checkout API fell over every Black Friday and nobody knew why. Turned out a single Redis
key was getting hit by every request. I sharded it by user and put a small local cache in front of it, and the next
Black Friday nobody got paged."
Too generic: "My experience in logistics aligns with your mission, and I would love to contribute to your team."
Sounds like a person: "I've spent 3 years routing delivery vans around Chicago, and the part that always broke was
the last-mile ETA. Your dispatch team is rebuilding that right now, and it's the problem I'd pick if I got to pick."

source: the filename(s) the facts came from. confidence: 0-1.

QUESTIONS:
${JSON.stringify(
  questions.map((q) => {
    const max = q.maxWords ?? 100;
    return { id: q.id, question: q.label, minWords: Math.round(max * 0.85), maxWords: max };
  }),
)}

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
            evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
            value: { type: Type.STRING, nullable: true },
            source: { type: Type.STRING, nullable: true },
            confidence: { type: Type.NUMBER },
          },
          required: ["fieldId", "evidence", "value", "source", "confidence"],
          // Evidence first, so the answer is written from the quotes rather than the quotes fitted to the answer.
          propertyOrdering: ["fieldId", "evidence", "value", "source", "confidence"],
        },
      },
    },
  });
  const data = searchable(`${twinMarkdown}\n${JSON.stringify(critical)}`);
  const limits = new Map(questions.map((q) => [q.id, q.maxWords ?? 100]));
  return (JSON.parse(res.text ?? "[]") as (FilledField & { evidence: string[] })[]).map(({ evidence, ...a }) => {
    const problem = a.value && ungrounded(a.value, evidence, data);
    if (problem) console.warn(`[formly] dropped short answer ${a.fieldId}: ${problem}`);
    return {
      ...a,
      value: a.value && !problem ? trimToWords(humanize(a.value), limits.get(a.fieldId) ?? 100) : null,
      source: problem ? null : a.source,
    };
  });
}

/** Lowercase, join digit groups (1,200 -> 1200) and reduce punctuation to spaces, so quotes match loosely. */
function searchable(text: string) {
  return ` ${text
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/\.(?!\d)/g, " ")
    .replace(/[^a-z0-9.%]+/g, " ")
    .trim()} `;
}

/**
 * Why a drafted short answer isn't backed by the user's data, or null if it is: none of its evidence quotes
 * appear in the data, or it uses a number (10 and up; smaller ones are everyday words) the data doesn't have.
 */
function ungrounded(answer: string, evidence: string[], data: string) {
  if (!evidence.some((e) => searchable(e).trim() && data.includes(searchable(e)))) return "no evidence found in data";
  const numbers = searchable(answer).match(/\d+(\.\d+)?/g) ?? [];
  const invented = numbers.filter((n) => Number(n) >= 10 && !new RegExp(`(^|[^0-9.])${n.replace(".", "\\.")}([^0-9]|$)`).test(data));
  return invented.length ? `numbers not in data: ${invented.join(", ")}` : null;
}

/** Swap the punctuation people rarely type into a form box for what they'd use instead. */
function humanize(text: string) {
  return text
    .replace(/\s*—\s*/g, " - ")
    .replace(/–/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}
