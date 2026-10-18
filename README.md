# Formly

"Stripe for forms": a business adds a **Fill with Formly** button. The user connects their data in a secure Formly popup, and the business gets back only the answers the user approves.

## Run it

```bash
cp .env.example .env.local   # then add GEMINI_API_KEY (MLH Gemini credits)
npm install
npm run dev
```

- `/tmobile`: the demo merchant (a long T-Mobile signup form with the Fill with Formly button)
- `/formly`: your connected sources and your live digital twin
- `/formly/fill?session=…`: the popup that fills, reviews and sends the form

Sample persona files are in `sample-data/alex-chen/`. `Alex Chen - personal info.pdf` is the "desktop file" for the demo race.

## Pipeline

1. **Ingest** (`lib/extract.ts`): each upload becomes plain text. Gemini transcribes PDFs and images, and `mammoth` handles DOCX.
2. **Digital twin** (`lib/twin.ts`, `lib/llm.ts`): every source is merged into one markdown profile, and typed "critical info" facts are extracted from it. Both are rebuilt whenever a source is added or removed.
3. **Fill** (`/api/fill`): the business's JSON form schema, the critical info and the twin produce field values. The user reviews and approves them in the popup, and `postMessage` sends them back to the merchant page.

## Deploy (Dokploy)

Build from the `Dockerfile`. Set `GEMINI_API_KEY` and mount a volume at `/data` (SQLite).
