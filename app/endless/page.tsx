import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Endless form | Formly",
};

const FIELD_COUNT = 600;

type Kind = "full" | "half" | "third" | "area";

/** Sections in the order they repeat, each a list of rows of [label, kind]. */
const SECTIONS: { title: string; rows: [string, Kind][][] }[] = [
  {
    title: "Personal information",
    rows: [
      [["First name", "half"], ["Last name", "half"]],
      [["Middle name", "third"], ["Suffix", "third"], ["Date of birth", "third"]],
      [["Email address", "full"]],
      [["Phone number", "half"], ["Alternate phone", "half"]],
    ],
  },
  {
    title: "Home address",
    rows: [
      [["Street address", "full"]],
      [["Apartment, suite, etc.", "full"]],
      [["City", "third"], ["State", "third"], ["ZIP code", "third"]],
      [["Years at this address", "half"], ["Months at this address", "half"]],
    ],
  },
  {
    title: "Identification",
    rows: [
      [["Social Security number", "half"], ["Driver's license number", "half"]],
      [["Issuing state", "third"], ["Issue date", "third"], ["Expiration date", "third"]],
      [["Passport number", "full"]],
    ],
  },
  {
    title: "Employment",
    rows: [
      [["Employer name", "full"]],
      [["Job title", "half"], ["Start date", "half"]],
      [["Employer phone", "half"], ["Annual income", "half"]],
      [["Employer address", "full"]],
      [["Describe your role", "area"]],
    ],
  },
  {
    title: "Emergency contact",
    rows: [
      [["Full name", "half"], ["Relationship", "half"]],
      [["Phone number", "half"], ["Email address", "half"]],
    ],
  },
  {
    title: "Previous address",
    rows: [
      [["Street address", "full"]],
      [["City", "third"], ["State", "third"], ["ZIP code", "third"]],
      [["Move-in date", "half"], ["Move-out date", "half"]],
    ],
  },
  {
    title: "Education",
    rows: [
      [["School name", "full"]],
      [["Degree", "half"], ["Field of study", "half"]],
      [["Start year", "third"], ["End year", "third"], ["GPA", "third"]],
    ],
  },
  {
    title: "Additional information",
    rows: [
      [["Anything else we should know?", "area"]],
      [["How did you hear about us?", "full"]],
    ],
  },
];

const SPAN: Record<Kind, string> = { full: "col-span-6", half: "col-span-3", third: "col-span-2", area: "col-span-6" };

/** Walk the sections in order, numbering each pass, until there are FIELD_COUNT fields. */
function buildSections() {
  const out: { title: string; rows: [string, Kind][][] }[] = [];
  let count = 0;
  for (let i = 0; count < FIELD_COUNT; i++) {
    const section = SECTIONS[i % SECTIONS.length];
    const rows: [string, Kind][][] = [];
    for (const row of section.rows) {
      if (count >= FIELD_COUNT) break;
      const kept = row.slice(0, FIELD_COUNT - count);
      rows.push(kept);
      count += kept.length;
    }
    out.push({ title: `${i + 1}. ${section.title}`, rows });
  }
  return out;
}

/** A plain white page of 600 empty fields, for footage of scrolling through a huge form. */
export default function EndlessForm() {
  const sections = buildSections();
  return (
    <main className="min-h-screen flex-1 bg-white">
      <form className="mx-auto max-w-2xl px-4 py-16">
        {sections.map((section, s) => (
          <fieldset key={s} className="mb-12">
            <legend className="mb-5 text-lg font-semibold text-gray-900">{section.title}</legend>
            <div className="grid grid-cols-6 gap-x-4 gap-y-5">
              {section.rows.flatMap((row, r) =>
                row.map(([label, kind], c) => {
                  const id = `f-${s}-${r}-${c}`;
                  return (
                    <div key={id} className={SPAN[kind]}>
                      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
                        {label}
                      </label>
                      {kind === "area" ? (
                        <textarea
                          id={id}
                          rows={3}
                          className="block w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 outline-none focus:border-gray-500"
                        />
                      ) : (
                        <input
                          id={id}
                          type="text"
                          className="block h-11 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:border-gray-500"
                        />
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </fieldset>
        ))}
      </form>
    </main>
  );
}
