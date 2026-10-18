# Formly

"Stripe for forms": a business adds a **Fill with Formly** button. The user connects their data in a secure Formly popup, and the business gets back only the answers the user approves.

## Local development (fast; no Docker)

```bash
npm run setup     # installs deps, creates .env.local; then add GEMINI_API_KEY (MLH Gemini credits)
npm run dev       # http://localhost:3000, Turbopack hot reload
npm run reset     # wipe local SQLite data (sources, twin, permissions)
```

Local data is stored in `./data/formly.db`, which git ignores. You can also click **Reset demo** on `/formly` between rehearsals.

- `/demo`: pick which demo merchant form to try
- `/tmobile`: a long T-Mobile signup form with the Fill with Formly button
- `/spacexai`: a SpaceXAI job application. Formly fills it from your resume and drafts the two 50-word short answers
- `/chase`: a Chase Freedom Unlimited (Visa) credit card application, styled after Chase's own
- `/dmv`: a California DMV Application for Title or Registration (REG 343), styled after the DMV's online vehicle services
- `/formly`: your connected sources and your live digital twin
- `/formly/fill?session=…`: the popup that fills, reviews and sends the form

Sample persona files are in `sample-data/alex-chen/`. `Alex Chen - personal info.pdf` is the "desktop file" for the demo race.

## Pipeline

1. **Ingest** (`lib/extract.ts`): each upload becomes plain text. Gemini transcribes PDFs and images, and `mammoth` handles DOCX.
2. **Digital twin** (`lib/twin.ts`, `lib/llm.ts`): every source is merged into one markdown profile, and typed "critical info" facts are extracted from it. Both are rebuilt whenever a source is added or removed.
3. **Fill** (`/api/fill`): the business's JSON form schema, the critical info and the twin produce field values. The user reviews and approves them in the popup, and `postMessage` sends them back to the merchant page.
   - **Short answers** (`textarea` fields with `maxWords`): a second call, run in parallel, writes them in the user's voice using Gemini Flash (`GEMINI_WRITE_MODEL`). It must quote the facts it uses from the twin first. An answer is dropped (left blank for the user) if none of its quotes are in the twin, or if it uses a number the twin doesn't have.

## Permissions

There are three sharing modes per business: *Ask every time*, *Auto-share basics* (the default) and *Share everything*. Like Claude Code, each request shows a prompt with **1** Allow once, **2** Always allow, and **3** Deny (keyboard shortcuts work). Sensitive fields (SSN, card, ID number) each get their own prompt. Other personal info is grouped by form section. "Always allow" is saved per business.

## Connectors

- **Upload** (live): PDF, images, DOCX, TXT, CSV, JSON
- **Google** (mock): a fake consent screen with an account switcher for every persona in `sample-data/`. It syncs their `google_profile.json`, and Drive brings in their `personal_info.txt` and `resume.docx`
- **iCloud** (mock): the same process as Google, behind a fake Sign in with Apple sheet. It syncs the persona's `icloud_profile.json` (Apple Account and devices, contacts, iCloud Mail receipts, Wallet, Health Medical ID), and iCloud Drive brings in the same `personal_info.txt` and `resume.docx` as Google Drive
- Dropbox, Notion, banks and the rest: coming soon

## Deploy (Dokploy)

Build from the `Dockerfile`. Set `GEMINI_API_KEY` and mount a volume at `/data` (SQLite).
