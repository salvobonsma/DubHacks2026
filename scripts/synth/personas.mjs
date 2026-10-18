// Pull a small, diverse set of fully synthetic people from NVIDIA Nemotron-Personas-USA (CC BY 4.0)
// through the Hugging Face datasets-server rows API, and save them for the inbox generator.
import fs from "node:fs";

const OUT = "sample-data/synthetic/personas.json";
// /rows returns 503 for this dataset; /first-rows serves the first 100, which is plenty to pick 10 from.
const API = "https://datasets-server.huggingface.co/first-rows?dataset=nvidia/Nemotron-Personas-USA&config=default&split=train";

// Slots we want covered, so the eval hits students, families, retirees and different carriers' markets.
const SLOTS = [
  (p) => p.age >= 18 && p.age <= 22 && /student/.test(p.occupation + p.education_level),
  (p) => p.age >= 18 && p.age <= 24,
  (p) => p.age >= 25 && p.age <= 34 && p.marital_status === "never_married",
  (p) => p.age >= 30 && p.age <= 45 && p.marital_status === "married_present",
  (p) => p.age >= 35 && p.age <= 50 && p.marital_status === "married_present",
  (p) => p.age >= 40 && p.age <= 55 && p.marital_status === "divorced",
  (p) => p.age >= 55 && p.age <= 64,
  (p) => p.age >= 65 && p.marital_status === "widowed",
  (p) => p.age >= 65,
  (p) => /military|armed|soldier/.test(p.occupation),
];

const picked = [];
const states = new Set();
{
  const res = await fetch(API);
  if (!res.ok) throw new Error(`datasets-server ${res.status}`);
  const { rows } = await res.json();
  for (const { row } of rows) {
    const p = { ...row, age: Number(row.age) };
    for (let i = 0; i < SLOTS.length; i++) {
      if (picked[i] || !SLOTS[i](p) || states.has(p.state)) continue;
      picked[i] = p;
      states.add(p.state);
      break;
    }
  }
}

for (let i = 0; i < SLOTS.length; i++) picked[i] ??= undefined;
// The dataset has no name column; every narrative field opens with the person's full name.
function nameOf(p) {
  for (const k of ["sports_persona", "arts_persona", "travel_persona", "culinary_persona", "professional_persona", "persona"]) {
    const m = String(p[k] ?? "").match(/^([A-Z][a-zA-Z’'-]+(?: [A-Z][a-zA-Z’'-]+)+?)(?=[ ,’'])/);
    if (m && !/^(A|An|The)\b/.test(m[1])) return m[1];
  }
  return null;
}
const out = picked.filter(Boolean).map((p) => ({
  uuid: p.uuid,
  name: nameOf(p),
  sex: p.sex,
  age: p.age,
  marital_status: p.marital_status,
  education_level: p.education_level,
  bachelors_field: p.bachelors_field,
  occupation: p.occupation,
  city: p.city,
  state: p.state,
  zipcode: p.zipcode,
  persona: p.persona,
  professional_persona: p.professional_persona,
  cultural_background: p.cultural_background,
  hobbies: p.hobbies_and_interests_list,
}));
fs.writeFileSync(OUT, JSON.stringify({ source: "nvidia/Nemotron-Personas-USA (CC BY 4.0), https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA", personas: out }, null, 2));
console.log(out.map((p) => `${p.name} | ${p.age} | ${p.marital_status} | ${p.occupation} | ${p.city}, ${p.state}`).join("\n"));
