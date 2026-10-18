# Formly

"Stripe for forms": a business adds a **Fill with Formly** button. The user connects their data in a secure Formly popup, and the business gets back only the answers the user approves.

## Local development (fast; no Docker)

```bash
npm run setup     # installs deps, creates .env.local from .env.example; then add GEMINI_API_KEY (MLH Gemini credits)
npm run dev       # http://localhost:3000, Turbopack hot reload
npm run reset     # wipe local SQLite data (sources, twin, permissions, OAuth tokens)
```

Local data is stored in `./data/formly.db`, which git ignores. You can also click **Delete my data** on `/formly` between rehearsals.

`GEMINI_API_KEY` is the only required variable. Without it the pages load, but anything that reads a PDF or image or rebuilds the twin returns a clear "GEMINI_API_KEY is not set" error. Google and Microsoft sign-in are optional; see Connectors. Open the app at `http://localhost:3000` (not the LAN IP) when testing live sign-in, because Google and Microsoft only accept plain-http redirect URIs on localhost.

- `/demo`: pick which demo merchant form to try
- `/tmobile`: a long T-Mobile signup form (plans: Essentials, Experience More, Experience Beyond) with the Fill with Formly button
- `/spacexai`: a SpaceXAI job application. Formly fills it from your resume and drafts the two 50-word short answers
- `/chase`: a Chase Freedom Unlimited (Visa) credit card application, styled after Chase's own
- `/dmv`: a California DMV Application for Title or Registration (REG 343), styled after the DMV's online vehicle services
- `/formly`: your connected sources and your live digital twin
- `/formly/fill?session=…`: the popup that fills, reviews and sends the form
- `/formly/scan/<token>`: the phone page behind the "Scan with phone" QR code

Sample persona files are in `sample-data/<persona>/`. `sample-data/alex-chen/Alex Chen - personal info.pdf` is the "desktop file" for the demo race.

## Pipeline

1. **Ingest** (`lib/extract.ts`): each upload becomes plain text. Gemini transcribes PDFs and images, and `mammoth` handles DOCX.
2. **Digital twin** (`lib/twin.ts`, `lib/llm.ts`): every source is merged into one markdown profile, and typed "critical info" facts are extracted from it. Both are rebuilt whenever a source is added or removed.
3. **Fill** (`/api/fill`): the business's JSON form schema, the critical info and the twin produce field values. The user reviews and approves them in the popup, and `postMessage` sends them back to the merchant page.
   - **Short answers** (`textarea` fields with `maxWords`): a second call, run in parallel, writes them in the user's voice using Gemini Flash (`GEMINI_WRITE_MODEL`). It must quote the facts it uses from the twin first. An answer is dropped (left blank for the user) if none of its quotes are in the twin, or if it uses a number the twin doesn't have.

## Permissions

There are two sharing modes per business, picked from the **Sharing** control at the bottom of the popup: *Ask before sharing IDs and card* (the default) and *Share everything without asking*. In the default mode, Formly asks once for the form's ID fields (ID number, mother's maiden name; the SSN is never filled) and once for its payment card fields; everything else is filled without a prompt. Like Claude Code, each prompt offers **1** Allow once, **2** Always allow for this business, and **3** Don't share (keyboard shortcuts work). The prompt names only the fields that form actually asks for. A field you don't share is left blank and shows as "Not shared" in the review; you can type it on the business's own form. "Always allow" and the mode are saved per business.

## Connectors

Every connector is real; there is no demo sign-in on any page a real user reaches. `GET /api/connectors/status` reports which ones are live for the visitor. Sample personas exist only on `/demo` ("Sample data for testing", connector `sample`), for developers.

- **Google** (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`; hidden when unset). Real OAuth (PKCE, offline access). Two access modes via `GOOGLE_ACCESS`:
  - `full` (default): `openid email profile`, address, phone, birthday, `contacts.readonly`, `gmail.readonly`, `drive.readonly`. A sync imports the People profile, starred / family / emergency contacts, targeted Gmail searches (carrier mail, order and phone-purchase mail, streaming receipts, offer letters, pay stubs, tax forms, utility bills, ID and travel mail; a few newest each, plus the first PDF or image attachment) and Drive files named like a resume, license, passport, pay stub, lease or tax form. At most 20 files. Each item is labelled with where it came from ("Gmail: Pay stub, Mar 2026"). Works for test users on the consent screen while the app is in Testing mode; the popup warns that Google will show its unverified-app screen.
  - `picker`: sign-in plus `drive.file` only. The user picks documents in the Google Picker (`GOOGLE_API_KEY`, `GOOGLE_APP_ID`), and can opt in to address, phone and birthday (incremental consent, unverified-app warning). Gmail is off.
  - After the callback the popup lands back on the same fill session, imports, rebuilds the twin and runs the fill without another tap.
- **Photograph your ID** (phones): opens the back camera for the front of a license or a passport page.
- **Upload** : PDF, images, DOCX, TXT, MD, CSV, JSON, contact cards (`.vcf`) and saved emails (`.eml`). Gemini reads PDFs and images.
- **Scan with phone** (desktop): a QR code for a single-use link (15 minutes) to `/formly/scan/<token>`. The photos land in the sources of the visitor who showed the code, not the phone's own. Uses `PUBLIC_ORIGIN`, else this machine's LAN IP.
- **Microsoft** (`MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET`; hidden when unset): common tenant (work, school and personal accounts), delegated `openid email profile offline_access User.Read Files.Read Mail.Read`. Imports `/me`, matching OneDrive files and Outlook messages. Some work or school accounts block third-party apps.

Setup, click by click: `../plan/LIVE-SETUP.md`.

## Fill: facts, suggestions, and what's never guessed

Each form field gets one of three rules (`fieldRule` in `lib/llm.ts`, or the schema's `identity` / `suggest` hints):
- **Identity** (date of birth, ID number, card details): copied only when the data states it. Never inferred. Missing ones show in review as "{Business} will ask you for this". The SSN is never filled at all.
- **Choices** (plan, lines, device, keep my number, autopay, paperless, contact preference, security question): copied when stated, otherwise a best suggestion with a one-line reason from the data, shown as "Suggested: Experience More, because …". Suggestions are approved like any other field.
- **Everything else**: copied when stated, inferred as a suggestion only from clear evidence (e.g. current carrier from a carrier bill).

## Privacy: one visitor never sees another's data

- `proxy.ts` gives every visitor a random 128-bit id in the httpOnly, SameSite=Lax `formly_uid` cookie (Secure on https). Every per-user table carries `user_id` and every query filters by it: sources, twin, fact edits, grants, sessions and their results, OAuth tokens and states, scan tokens.
- A fill session belongs to the visitor who created it; `/api/sessions` and `/api/fill` answer 404 to anyone else.
- Auto-delete: once any of a visitor's rows is older than `FORMLY_TTL_MINUTES` (default 60), all of their data is deleted, checked on every request and every 5 minutes.
- **Delete my data** on `/formly` (`DELETE /api/me`) deletes everything now and revokes the Google grant at Google.
- Migration: schema 2 dropped and recreated the per-user tables (they only ever held demo data).

## Deploy (Dokploy)

Build from the `Dockerfile`. Set `GEMINI_API_KEY` and mount a volume at `/data` (SQLite). For live Google or Microsoft sign-in, also set their client ID and secret, set `PUBLIC_ORIGIN` to the https URL, and register that origin's callback URIs.
