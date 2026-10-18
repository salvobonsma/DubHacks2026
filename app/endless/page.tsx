import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Endless form | Formly",
};

const FIELD_COUNT = 600;

/** Row layouts, repeated in a fixed order so the page looks like a long, varied form. */
const PATTERN: ("full" | "half" | "third" | "area")[][] = [
  ["full"],
  ["half", "half"],
  ["full"],
  ["third", "third", "third"],
  ["half", "half"],
  ["area"],
  ["full"],
  ["half", "half"],
];

const SPAN = { full: "col-span-6", half: "col-span-3", third: "col-span-2", area: "col-span-6" };

function buildRows() {
  const rows: (keyof typeof SPAN)[][] = [];
  let count = 0;
  for (let i = 0; count < FIELD_COUNT; i++) {
    const row = PATTERN[i % PATTERN.length].slice(0, FIELD_COUNT - count);
    rows.push(row);
    count += row.length;
  }
  return rows;
}

/** A plain white page of 600 empty fields, for footage of scrolling through a huge form. */
export default function EndlessForm() {
  const rows = buildRows();
  return (
    <main className="min-h-screen flex-1 bg-white">
      <form className="mx-auto grid max-w-2xl grid-cols-6 gap-x-4 gap-y-6 px-4 py-16">
        {rows.flatMap((row, r) =>
          row.map((kind, c) => (
            <div key={`${r}-${c}`} className={SPAN[kind]}>
              {kind === "area" ? (
                <textarea
                  rows={3}
                  aria-label={`Field ${r}-${c}`}
                  className="block w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 outline-none focus:border-gray-500"
                />
              ) : (
                <input
                  type="text"
                  aria-label={`Field ${r}-${c}`}
                  className="block h-11 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:border-gray-500"
                />
              )}
            </div>
          )),
        )}
      </form>
    </main>
  );
}
