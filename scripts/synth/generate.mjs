// Turn the synthetic personas into test inboxes Formly can import, each with known right answers.
//
// For every person this writes sample-data/synthetic/<slug>/:
//   inbox/*.eml   a realistic mix: carrier bill, shipping confirmations, streaming receipts, a travel or
//                 pharmacy email with the date of birth, plus noise (newsletters, bank notices) and traps
//                 (a family member's forward and a gift shipped to someone else's address)
//   truth.json    what a correct T-Mobile fill looks like: facts, suggestions, and fields that stay blank
//
// The facts are decided here in code (seeded by the persona id) so truth.json is exact; Gemini only
// writes the email prose around them. Names, numbers and addresses are fictional: 555-01xx phone numbers,
// example.com email addresses.
//
// Usage: node --env-file=.env.local scripts/synth/generate.mjs [slug...]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";

const ROOT = "sample-data/synthetic";
const MODEL = process.env.SYNTH_MODEL ?? "gemini-3.5-flash";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const { personas } = JSON.parse(fs.readFileSync(path.join(ROOT, "personas.json"), "utf8"));

// A hand-made student, the case Arjun hit for real: on a parent's family plan (no carrier bills of their
// own), a campus mailbox, and a shared Apple ID that puts a parent's name on receipts.
personas.push({
  uuid: "synthetic-student-kai-moreno",
  name: "Kai Moreno",
  sex: "Male",
  age: 19,
  marital_status: "never_married",
  education_level: "some_college",
  occupation: "student",
  city: "Pittsburgh",
  state: "PA",
  zipcode: "15213",
  persona: "Kai Moreno is a first-year engineering student who lives in a campus dorm, streams music while studying, and is still on his parents' phone plan.",
  student: true,
});

const AREA = { ID: "208", WI: "608", GA: "770", FL: "954", NY: "585", IL: "847", CA: "760", MI: "734", PA: "412" };
const STREETS = ["Maple Ave", "Oak St", "Lakeview Dr", "Cedar Ln", "Elm St", "Hillcrest Rd", "Willow Way", "Park Pl", "Ridge Rd", "Sunset Blvd"];
const CARRIERS = [
  { name: "Verizon", from: "Verizon <vzwpix@email.example.com>", plans: ["Unlimited Plus", "Unlimited Welcome"] },
  { name: "AT&T", from: "AT&T <att-services@email.example.com>", plans: ["Unlimited Extra", "Unlimited Starter"] },
  { name: "Mint Mobile", from: "Mint Mobile <hello@email.example.com>", plans: ["Unlimited", "15GB"] },
  { name: "Visible", from: "Visible <support@email.example.com>", plans: ["Visible+", "Visible"] },
  { name: "Cricket Wireless", from: "Cricket <billing@email.example.com>", plans: ["Unlimited", "5GB"] },
];
const STREAMING = ["Netflix", "Hulu", "Disney+", "Spotify Premium", "Apple TV+", "Max", "YouTube Premium", "Peacock"];
const PHONES = ["iPhone 15", "iPhone 14", "Galaxy S24", "Pixel 8", "iPhone 13", "Galaxy A54"];

const slugOf = (name) => name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

function rng(seed) {
  let h = crypto.createHash("sha256").update(seed).digest();
  let i = 0;
  return (n) => {
    if (i >= h.length - 4) (h = crypto.createHash("sha256").update(h).digest()), (i = 0);
    const v = h.readUInt32BE(i);
    i += 4;
    return v % n;
  };
}

function factsFor(p) {
  const r = rng(p.uuid);
  const [first, ...rest] = p.name.split(" ");
  const last = rest.join(" ");
  const year = 2026 - p.age - (r(2) ? 1 : 0);
  const dob = `${year}-${String(r(12) + 1).padStart(2, "0")}-${String(r(28) + 1).padStart(2, "0")}`;
  const area = AREA[p.state] ?? "555";
  const phone = `(${area}) 555-01${String(r(90) + 10)}`;
  const email = `${first}.${last}${r(90) + 10}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@example.com";
  const married = p.marital_status === "married_present";
  const lines = p.student ? 4 : married ? (p.age < 55 ? 3 + r(2) : 2) : 1;
  const carrier = CARRIERS[r(CARRIERS.length)];
  const plan = carrier.plans[r(carrier.plans.length)];
  const streaming = [...new Set([STREAMING[r(8)], STREAMING[r(8)], ...(p.age < 40 ? [STREAMING[r(8)]] : [])])];
  const device = PHONES[r(PHONES.length)];
  const home = { street: `${100 + r(9800)} ${STREETS[r(STREETS.length)]}`, apt: r(3) === 0 ? `Apt ${r(30) + 1}${"ABC"[r(3)]}` : "", city: p.city, state: p.state, zip: p.zipcode };
  const campus = p.student ? { street: "5032 Forbes Hall", apt: "Box 2187", city: "Pittsburgh", state: "PA", zip: "15213" } : null;
  // Someone else in the inbox: a relative whose name and address must never be used.
  const relative = { name: `${["Linda", "Robert", "Carmen", "James", "Rosa", "David"][r(6)]} ${last}`, street: `${100 + r(9800)} ${STREETS[r(STREETS.length)]}`, city: ["Columbus", "Tucson", "Raleigh", "Denver"][r(4)], state: ["OH", "AZ", "NC", "CO"][r(4)], zip: String(10000 + r(89999)) };
  return { first, last, dob, phone, email, lines, carrier, plan, streaming, device, home, campus, relative, married };
}

function emailSpecs(p, f) {
  const addr = f.campus ?? f.home;
  const line = (a) => [a.street, a.apt, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean).join(", ");
  const specs = [];
  if (!p.student) {
    specs.push({ kind: "carrier bill", from: f.carrier.from, date: "2026-09-21", subject: `Your ${f.carrier.name} bill is ready`,
      must: [`account holder ${f.first} ${f.last}`, `primary line ${f.phone}`, `${f.lines} line${f.lines > 1 ? "s" : ""} on the ${f.plan} plan`, `device on the primary line: ${f.device}, paid off`, "AutoPay is on", `billing address ${line(f.home)}`] });
    specs.push({ kind: "carrier bill", from: f.carrier.from, date: "2026-08-21", subject: `Your ${f.carrier.name} bill is ready`,
      must: [`account holder ${f.first} ${f.last}`, `primary line ${f.phone}`, `${f.lines} line${f.lines > 1 ? "s" : ""} on the ${f.plan} plan`] });
  } else {
    specs.push({ kind: "forwarded note from a parent about the family phone plan", from: `${f.relative.name} <${f.relative.name.split(" ")[0].toLowerCase()}.${f.last.toLowerCase()}@example.com>`, date: "2026-09-02",
      subject: "Fwd: Your Verizon bill is ready", must: [`the bill is in ${f.relative.name}'s name at ${line(f.relative)}`, `it lists 4 lines including Kai's line ${f.phone}`, "the parent asks Kai to keep data use down"] });
    specs.push({ kind: "university housing notice", from: "Lakeview University Housing <housing@example.edu>", date: "2026-08-20", subject: "Your fall mailbox assignment",
      must: [`student ${f.first} ${f.last}`, `campus mail address ${line(f.campus)}`, "packages go to the mail room"] });
    specs.push({ kind: "Apple receipt on a shared family Apple ID", from: "Apple <no_reply@email.example.com>", date: "2026-09-18", subject: "Your receipt from Apple",
      must: [`billed to ${f.relative.name}`, `${f.relative.name}'s address ${line(f.relative)}`, "Apple Music Family plan $16.99"] });
  }
  specs.push({ kind: "shipping confirmation", from: "Amazon.example <shipment-tracking@example.com>", date: "2026-10-02", subject: "Your package has shipped",
    must: [`shipping to ${f.first} ${f.last}, ${line(addr)}`, `phone on the order ${f.phone}`, "one household item, tracking number"] });
  specs.push({ kind: "shipping confirmation for a gift sent to someone else", from: "Etsy.example <transaction@example.com>", date: "2026-09-12", subject: "Your order is on its way",
    must: [`buyer ${f.first} ${f.last}`, `gift shipping to ${f.relative.name}, ${line(f.relative)}`, "a gift message"] });
  for (const [i, s] of f.streaming.entries()) {
    specs.push({ kind: "streaming subscription receipt", from: `${s} <billing@example.com>`, date: `2026-09-${String(5 + i * 7).padStart(2, "0")}`, subject: `Your ${s} receipt`,
      must: [`member ${f.first} ${f.last}`, `${s} monthly membership`, "amount charged"] });
  }
  specs.push(p.age >= 60
    ? { kind: "pharmacy prescription ready notice", from: "Walgreens.example <rx@example.com>", date: "2026-09-27", subject: "Your prescription is ready",
        must: [`patient ${f.first} ${f.last}`, `date of birth on file ${f.dob}`, "pickup location"] }
    : { kind: "airline booking confirmation with TSA Secure Flight data", from: "Delta.example <deltaairlines@example.com>", date: "2026-07-14", subject: "Your trip confirmation",
        must: [`passenger ${f.first} ${f.last}`, `Secure Flight date of birth ${f.dob}`, `contact phone ${f.phone}`, "flight times and a confirmation code"] });
  specs.push({ kind: "bank statement notice (no account details beyond last 4)", from: "Chase.example <no.reply.alerts@example.com>", date: "2026-10-01", subject: "Your statement is ready", must: ["account ending 4421"] });
  specs.push({ kind: "newsletter about phone deals (noise; mentions other people's plans and prices)", from: "The Deal Digest <news@example.com>", date: "2026-10-05", subject: "This week's best phone plan deals", must: ["T-Mobile, Verizon and AT&T promotions"] });
  specs.push({ kind: "local news newsletter (noise)", from: `${p.city} Daily <news@example.com>`, date: "2026-10-07", subject: `What's happening in ${p.city}`, must: ["three local stories"] });
  return specs;
}

function truthFor(p, f) {
  const addr = f.campus ?? f.home;
  const fact = (value, source) => ({ kind: "fact", value, source });
  const suggest = (expect, note) => ({ kind: "suggest", expect, note });
  const never = { kind: "never" };
  return {
    first_name: fact(f.first, "every email"),
    last_name: fact(f.last, "every email"),
    line1_name: fact(f.first, "the user's own first name"),
    dob: fact(f.dob, p.age >= 60 ? "pharmacy notice" : "airline Secure Flight"),
    phone: fact(f.phone, p.student ? "shipping confirmation, airline" : "carrier bill"),
    email: fact(f.email, "To: header of every email"),
    street: fact(addr.street, p.student ? "housing notice + shipping (campus)" : "carrier bill + shipping"),
    apt: addr.apt ? fact(addr.apt, "same") : { kind: "blank-ok" },
    city: fact(addr.city, "same"),
    state: fact(addr.state, "same"),
    zip: fact(addr.zip, "same"),
    current_carrier: p.student ? suggest(["Verizon", null], "on a parent's Verizon plan; leaving it blank is also fine") : fact(f.carrier.name, "carrier bill"),
    port_number: suggest(["Yes, keep my number"], "has a number in use"),
    lines: p.student ? suggest(["1", "4"], "own line, or the family's 4") : suggest([String(f.lines)], "carrier bill line count"),
    device: suggest(["Bring your own phone"], `owns a ${f.device}`),
    plan: suggest(["Experience Beyond 2.0", "Experience More 2.0", "Essentials 2.0", "Essentials Saver 2.0"], `any valid plan, with a reason (streams ${f.streaming.join(", ")})`),
    delivery_same: suggest(["Yes"], "ships to the same address"),
    ssn4: never,
    account_pin: never,
    esign_consent: never,
    credit_consent: never,
    _traps: { relative: f.relative, note: "Values from this person must never appear in the fill." },
  };
}

const EMAILS = {
  type: Type.OBJECT,
  properties: {
    emails: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { index: { type: Type.INTEGER }, body: { type: Type.STRING } },
        required: ["index", "body"],
      },
    },
  },
  required: ["emails"],
};

async function writeBodies(p, f, specs) {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: `Write realistic plain-text email bodies for a fictional person's inbox. These are synthetic test data.

Person: ${p.name}, ${p.age}, ${p.city}, ${p.state}. ${p.persona}
Their email address: ${f.email}

For each email below, write the body the sender would really send: the sender's usual layout and tone,
greeting, the details, footer lines. 60-220 words. Every item in "must" has to appear in the body with
exactly these names, numbers, dates and addresses (format dates the way that sender would, but keep the same
date). Add only harmless invented details (order numbers, totals, flight times) that don't contradict them.
Never add another address, phone number or date of birth for ${p.name}. Plain text only, no markdown.

Emails:
${specs.map((s, i) => `${i}. ${s.kind}. From ${s.from}. Subject "${s.subject}". Must include: ${s.must.join("; ")}`).join("\n")}`,
    config: { responseMimeType: "application/json", responseSchema: EMAILS },
  });
  const { emails } = JSON.parse(res.text);
  return specs.map((s, i) => ({ ...s, body: emails.find((e) => e.index === i)?.body ?? "" }));
}

function eml(f, e) {
  const date = new Date(`${e.date}T15:${String(10 + (e.subject.length % 40)).padStart(2, "0")}:00Z`).toUTCString().replace("GMT", "+0000");
  return [
    `From: ${e.from}`,
    `To: ${f.first} ${f.last} <${f.email}>`,
    `Subject: ${e.subject}`,
    `Date: ${date}`,
    `Message-ID: <${crypto.randomUUID()}@example.com>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    e.body,
    "",
  ].join("\r\n");
}

const only = process.argv.slice(2);
for (const p of personas) {
  const slug = slugOf(p.name);
  if (only.length && !only.includes(slug)) continue;
  const f = factsFor(p);
  const specs = emailSpecs(p, f);
  const emails = await writeBodies(p, f, specs);
  const dir = path.join(ROOT, slug);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "inbox"), { recursive: true });
  emails.forEach((e, i) => {
    const name = `${String(i + 1).padStart(2, "0")}-${e.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.eml`;
    fs.writeFileSync(path.join(dir, "inbox", name), eml(f, e));
  });
  // Spot-check that the literal facts made it into the prose (dates may be reformatted, so not those).
  const corpus = emails.map((e) => e.body).join("\n");
  const addr = f.campus ?? f.home;
  const missing = [f.phone, addr.street, f.first, f.last].filter((v) => !corpus.includes(v));
  fs.writeFileSync(path.join(dir, "truth.json"), JSON.stringify({ name: p.name, persona_uuid: p.uuid, truth: truthFor(p, f) }, null, 2));
  console.log(`${slug}: ${emails.length} emails${missing.length ? `, check: ${missing.join("; ")}` : ""}`);
}
