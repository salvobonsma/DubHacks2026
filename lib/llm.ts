import { GoogleGenAI, ThinkingLevel, Type, type GenerateContentParameters, type Part } from "@google/genai";
import type { CriticalFact, FilledField, FormField, FormSchema } from "./types";
import { trimToWords } from "./words";

// Flash-Lite with low thinking: ~3s fills, same accuracy as Flash on these extraction tasks.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const FILL_MODEL = process.env.GEMINI_FILL_MODEL ?? MODEL;
// A form with choice fields (plan, lines, device…) needs suggestions reasoned from evidence, not just copying:
// Flash-Lite at low thinking flip-flopped on those (a 2-line bill read as 1 line, the phone on the bill missed),
// so those fills default to Flash.
const SUGGEST_MODEL = process.env.GEMINI_SUGGEST_MODEL ?? "gemini-3.5-flash";
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

/**
 * Whose data this is. A shared Apple ID, a family plan or a forwarded booking puts other people's names, addresses
 * and cards in the account owner's mail; none of that may become the user's identity (spec section 6 dry run).
 */
const WHOSE_DATA = `Whose data this is: the user is the account owner, named in the "## Google profile" section or the
"Google account:" line, or on their own ID, resume or bank account owner record. A different name on an order,
receipt, subscription, booking or bill is another person (a family member sharing the account): list what it says
under People & Plans as theirs (e.g. "- **Sam Lee (family, on a shared Apple order):** iPhone 16, shipped to …"),
and never use it as the user's name, birthday, address, phone, email or payment card.
Addresses: label each by what its source shows. An address an order shipped or was delivered to is a "Shipping
address" (add "campus mailbox" when it has a mailbox number such as SMC, Box, CPO or PO Box), not a home address,
unless a profile, ID, lease, bill or bank record also gives it as home.`;

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
${WHOSE_DATA}
Use bullet points "- **Label:** value _(source: label)_", where label is the most specific heading the fact sits
under inside its SOURCE ("Gmail: Pay stub, Mar 2026", "Drive: Resume.pdf"), else the SOURCE filename. When sources conflict, prefer the most recent/official
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
source: the most specific label the fact sits under inside its SOURCE (a "### " heading such as
"Gmail: Pay stub, Mar 2026"), else the SOURCE filename. Never invent information.
${WHOSE_DATA}
Facts about other people get a key that says whose they are (e.g. "family_member_1_shipping_address").

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

/** Stage 3: critical info + twin + business form schema -> field values. Short answers are written separately. */
export async function fillForm(
  schema: FormSchema,
  critical: CriticalFact[],
  twinMarkdown: string,
): Promise<FilledField[]> {
  const essays = schema.fields.filter((f) => f.type === "textarea");
  const facts = schema.fields.filter((f) => f.type !== "textarea" && !neverFill(f));
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

/**
 * How the fill may treat a field.
 * copy: an identity fact (SSN, ID number, date of birth, card details). Only ever copied from the data, never
 *   inferred or suggested; with no evidence the business asks the user for it.
 * choice: a choice or preference (plan, lines, device, keep my number, autopay…). Copied when the data says,
 *   otherwise a best suggestion with a one-line reason.
 * fact: everything else. Copied when stated, inferred as a suggestion only from clear evidence, else blank.
 */
export type FieldRule = "copy" | "choice" | "fact";

const IDENTITY =
  /social security|\bssn\b|\bitin\b|tax id|date of birth|birth ?date|birthday|\bdob\b|\bid (number|no|type|state|expir)|issuing state|licen[cs]e (number|no|state|class|expir)|passport|card number|\bcvv|\bcvc|security code|expiration|expiry|\bpin\b|password|security answer|mother'?s maiden|account number|routing/i;
const CHOICE =
  /\bplan\b|number of lines|how many lines|\blines\b|device|phone model|keep (your|my|current)|transfer (your|my)|\bport\b|auto ?pay|paperless|e-?bill|billing (method|preference)|contact (preference|method)|preferred (contact|language|method|store|time)|how (should|may|can|do) we|security question|protection|trade.?in|accessor|storage|capacity|financ|payment option|(delivery|shipping) (method|speed|option)|pickup|newsletter|marketing|how did you hear/i;

/**
 * Never filled at all, whatever the data says: the business collects it itself. An SSN (the T-Mobile race stops
 * before it), a PIN or password the user makes up, a legal consent only the user can give.
 */
const NEVER_FILL = /social security|\bssn\b|\bitin\b|\bconsent\b|i agree|account pin|create (a|your) (pin|password)/i;

export function neverFill(f: FormField): boolean {
  return !!f.never || NEVER_FILL.test(f.label) || /^(ssn|ssn4|itin)$/i.test(f.id);
}

export function fieldRule(f: FormField): FieldRule {
  if (f.identity || f.category === "sensitive" || IDENTITY.test(f.label)) return "copy";
  if (f.suggest || CHOICE.test(f.label)) return "choice";
  return "fact";
}

const FILL_RESPONSE = {
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        fieldId: { type: Type.STRING },
        value: { type: Type.STRING, nullable: true },
        kind: { type: Type.STRING, enum: ["fact", "suggestion"] },
        evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        source: { type: Type.STRING, nullable: true },
        reason: { type: Type.STRING, nullable: true },
        confidence: { type: Type.NUMBER },
      },
      required: ["fieldId", "value", "kind", "evidence", "source", "reason", "confidence"],
      // Evidence, where it comes from and why before the value, so the value follows from the data, not the
      // other way round.
      propertyOrdering: ["fieldId", "evidence", "kind", "source", "reason", "value", "confidence"],
    },
  },
};

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
    rule: fieldRule(f),
    ...(f.options ? { options: f.options } : {}),
    ...(f.hint ? { hint: f.hint } : {}),
  }));
  const res = await generate({
    model: fields.some((f) => f.rule === "choice") ? SUGGEST_MODEL : FILL_MODEL,
    contents: `Fill out ${schema.business}'s form "${schema.title}" for the user from the user's data below.
Today is ${new Date().toISOString().slice(0, 10)}.
${schema.context ? `\nWhat ${schema.business} offers on this form (for suggestions and their reasons): ${schema.context}\n` : ""}
${WHOSE_DATA}

Return one entry per form field id. Each field has a rule:
- "copy": an identity fact (SSN, ID numbers, date of birth, card details). Copy it exactly when the data states
  it for the user (kind "fact"). Otherwise value null. Never infer, estimate, guess or suggest it.
- "fact": copy it when the data states it for the user (kind "fact"). If the data doesn't state it but gives
  clear evidence, you may infer it (kind "suggestion"), e.g. the current carrier from a carrier bill email,
  employment status from pay stubs or a student email, the emergency contact from a Family-labelled contact.
  No evidence: null. A carrier is never inferred from a phone purchase, a contact or a family member's mail.
- "choice": a choice or preference. If the data states it, kind "fact". Otherwise ALWAYS give the best
  suggestion (kind "suggestion") that fits the evidence and what ${schema.business} offers: plan from how they use
  their phone and what they pay for now (a streaming subscription a plan includes, data use, travel, being a student;
  a budget carrier or a low bill, roughly under $40 a line, points to the cheapest plans, and streaming perks only
  count when they already pay for that exact service; a student gets a "Student Savings" option when one is listed;
  the reason names that receipt or bill and what the plan gives them for it, and only perks the business lists
  for that very plan), number of lines from the lines on their own carrier bill (else 1, just them), keep their number when
  they have a phone number of their own (name the number, and the carrier when known), bring their own phone when
  the data shows the phone they have now (name that phone: the one on their own line of a carrier bill or on their
  own phone receipt), autopay and paperless from how they pay their other bills (a carrier bill saying AutoPay or
  paper-free is on), delivery to the same address when that is where their orders already go. A select choice with nothing in the data bearing on it:
  suggest the usual choice and say that nothing in their data points elsewhere. A text choice with no evidence:
  null.
Values:
- Format for the field type: date -> YYYY-MM-DD, tel -> (555) 555-5555, number -> digits only,
  select -> exactly one of the listed options. A field's "hint", when given, says what belongs in it.
- Address parts: the street line goes in the street field and the unit (Apt, Suite, Unit, #, or a mailbox number
  such as SMC 4417) in the apartment/suite field when the form has one. An address known only from a shipping or
  delivery confirmation is kind "suggestion" for every part, with a reason naming the order it shipped to (and
  "a campus mailbox" when it is one); from a profile, ID, lease, bill or bank record it is a fact.
- Ages and years of experience: work them out from the dates in the data, as of today.
- If the data explicitly says there is none (no lienholder, no apartment number, no suffix), that is an answer:
  use "None", or "N/A" if the data says N/A. For a select, pick the option that means none if there is one.
  Only when the data says so in words: an address that simply has no unit leaves the apartment/suite field null,
  never "None".
- Never invent a name, number, date or address that isn't in the data.
evidence: first, up to 3 short quotes copied word for word from the data that bear on this field (for a plan:
  every streaming or subscription receipt, data use, travel, student status; for a device: the phone on the
  user's own line or receipt). [] when nothing in the data bears on it.
source: the most specific label the value came from (the "### " heading or source note in the data, e.g.
  "Gmail: Carrier bill, Mar 2026" or "Drive: Resume.pdf"), else the SOURCE filename. null when value is null.
reason: for a suggestion, one short line (under 16 words) to the user saying why, naming the specific thing in
  their data it rests on and its date or number, e.g. "your Verizon bill from Sep 2026 lists 2 phone lines" or
  "your number (412) 555-0187 can move to ${schema.business}". It is shown after the word "because", so start
  lowercase (unless the first word is a name) and don't repeat "because". It is about the evidence you quoted.
  Never a vague line such as "it is in your data", and never claim something the data doesn't show; only with
  evidence [] say "nothing in your data points elsewhere". For a fact, null. confidence: 0-1.

FORM FIELDS:
${JSON.stringify(fields)}

CRITICAL INFO:
${JSON.stringify(critical)}

FULL DIGITAL TWIN:
${twinMarkdown}`,
    // Same data, same answers: no sampling randomness on top of the rules above.
    config: { ...FILL_RESPONSE, temperature: 0 },
  });
  const byId = new Map(formFields.map((f) => [f.id, f]));
  const out = JSON.parse(res.text ?? "[]") as (FilledField & { kind?: string; evidence?: string[] })[];
  const checked = out.map(({ kind, evidence, ...f }) =>
    checkFill(byId.get(f.fieldId), { ...f, suggested: kind === "suggestion" }, evidence?.filter((e) => e.trim()) ?? []),
  );
  // A choice with a usual pick is never left blank, even when the model skipped it.
  const answered = new Set(checked.map((f) => f.fieldId));
  const skipped = formFields.filter((f) => !answered.has(f.id) && f.default && fieldRule(f) === "choice");
  return [...checked, ...skipped.map(usualPick)];
}

/** Shown after "because" when nothing in the user's data made the choice: honest, and the same every time. */
const USUAL_REASON = "it's the usual pick, and you can change it";

/**
 * The schema's usual pick for a choice nothing in the data bears on. Picked here in code, not by the model, so
 * the same data gets the same suggestion on every run (the model flip-flopped between plans and number choices).
 */
function usualPick(field: FormField): FilledField {
  return { fieldId: field.id, value: field.default ?? null, source: null, confidence: 0.5, suggested: true, reason: USUAL_REASON };
}

/**
 * The model's answer for one field, held to the rules: identity facts are never suggestions, a select value
 * must be one of its options, a number is digits, and a suggestion without a reason isn't shown as one. Only a
 * choice may be suggested with nothing in the data behind it, and then it gets the schema's usual pick when it
 * has one rather than the model's guess of the moment; any other field suggested
 * without evidence (a carrier guessed as "Other") is dropped, so the business asks for it instead.
 */
function checkFill(field: FormField | undefined, f: FilledField, evidence: string[] = []): FilledField {
  const blank = { ...f, value: null, source: null, reason: null, suggested: false };
  let value = f.value?.trim() || null;
  if (!field || neverFill(field)) return blank;
  const rule = fieldRule(field);
  const noEvidence = !evidence.length || /nothing in your data/i.test(f.reason ?? "");
  if (rule === "choice" && field.default && (!value || (f.suggested && noEvidence))) return usualPick(field);
  if (!value) return blank;
  if (rule === "copy" && f.suggested) return blank;
  if (rule === "fact" && f.suggested && noEvidence) return blank;
  if (field.type === "select" && field.options?.length) {
    const opt = field.options.find((o) => o.toLowerCase() === value!.toLowerCase());
    if (!opt) return blank;
    value = opt;
  }
  if (field.type === "number") {
    value = value.replace(/[^\d.]/g, "");
    if (!value) return blank;
  }
  const reason = f.suggested ? f.reason?.trim().replace(/^because\s+/i, "") || null : null;
  if (f.suggested && !reason) return blank;
  // The model sometimes echoes the corpus marker ("SOURCE: Drive: Resume.pdf").
  const source = f.source?.replace(/^\s*SOURCE:\s*/i, "").trim() || null;
  return { ...f, value, source, reason, suggested: !!f.suggested };
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
