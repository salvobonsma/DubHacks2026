# Landing page spec: the Formly deck as a page

Source: `deck/Formly-deck.pptx` (17 slides, text and speaker notes) and `deck/brand/Formly-Brand-Guidelines.pdf`. Target: `app/page.tsx` at `/`, replacing the current three-line placeholder. Keep `FormlyHeader`.

## Who reads it and what it must do

Judges and Devpost visitors open this on a phone between booths, and teammates send the link in group chats. It has thirty seconds to make three things land, in this order: what Formly is (one tap fills any form), why that matters (forms lose people, autofill stops at your name), and why it is safe (you see every answer and its source; the business gets answers, not accounts). Then it hands off to the live demo. Everything a slide said out loud in the notes becomes body copy; everything a slide showed becomes a component. A deck is linear and spoken; a page is scanned and silent, so each section carries its own headline that states the point.

## What transfers from the deck and what does not

- Slides 1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17 become sections, in a reordered sequence (below).
- Slide 2 (the race) becomes a call to action that links to `/race`, which already exists. Do not rebuild the race on the landing page.
- Slide 8 (the $940M T-Mobile ask and pilot) stays out. It is a pitch to one buyer in one room, not public copy. The public page says "paid per finished sign-up" and leaves the carrier math to the deck. Mention T-Mobile only as the demo merchant and in the footer credit.
- Slide 16 (stack) shrinks to one line in the footer.
- Speaker-only lines ("hand the judge the phone", "cap the race at 60 seconds") do not appear.
- Every number appears once on the page, with its source in small text next to it: 70% (Baymard 2025), 47.8% (Zuko 2025, 2.2M telecom sessions), 13 of 33 vs 33 of 33, 0 autofill fields (WHATWG), $1,835 a year per account (Formly's estimate from T-Mobile public numbers; label it as an estimate).

## Sections, top to bottom

1. **Hero** (slides 1 and 5). Ink background. Eyebrow: "Stripe for forms". Display headline in Sora SemiBold 48px: "Fill any form in one tap." Body: "A business adds one button. You connect your data once. They get only the answers you approve." Primary button "Try the demo form" to `/demo`; secondary "My Formly" to `/formly`. Right of the copy (below it on mobile): a mock sign-up card in the Paper style showing the real `Fill with Formly` button above two or three greyed manual fields; on load, after a short delay, the fields fill one by one with the `formly-filled` animation already in `globals.css`. That is slide 5's straight line, shown instead of drawn. Respect `prefers-reduced-motion` (fields render filled, no animation).

2. **You've typed this a hundred times** (slide 3). Paper background. Headline as on the slide. One typewriter line that types "4521 Brooklyn Ave NE, Apt 3B, Seattle, WA 98105" while the label above it cycles through "for T-Mobile", "for your bank", "for your landlord", "for your school", "for an airline", "for the DMV", one or two deliberate typos corrected mid-way as the slide does. Six fields at once was right for a projector; one line on a phone. Closing sentence from the notes: "T-Mobile's sign-up alone is 33 fields." Reduced motion: show the finished line with the six labels as chips.

3. **Forms lose people** (slides 4 and 7's numbers). Two stat tiles side by side, then one wide tile. "70% of online checkouts are abandoned before they finish" (Baymard Institute, 2025, average of 50 studies). "47.8% of telecom sign-up forms convert. More than half the people who start one never finish." (Zuko form benchmarks, 2025, 2.2M telecom form sessions). Wide tile: "0 autofill fields exist for SSN, ID number, income, carrier account number or transfer PIN." (WHATWG HTML standard, autofill field names). Numbers in Sora SemiBold, large; sources in Slate 13px.

4. **Autofill stops where sign-ups get hard** (slide 7). The 33-field grid, grouped exactly as the slide groups them: Personal, Address, Payment, Identity, Employment, Plan & device, Emergency contact. A two-state toggle above it, "Browser autofill" / "Formly". In the autofill state, 13 fields are filled (the name, contact, address and card fields) and 20 stay empty with a dashed outline. In the Formly state all 33 fill, three (Plan, Lines, Keep number) tagged "suggested". Counter next to the toggle: "13 of 33" / "33 of 33". Default state is autofill so the visitor sees the gap, then flips it. Keyboard accessible, works without JS in the Formly state (render Formly state server-side, enhance to toggle).

5. **The answers already exist in your accounts** (slides 6 and 11). Four answer cards, each with field, value and source chip, exactly as the slide: Current carrier, Verizon, "Your Verizon bill in Gmail"; Number to transfer, 206-555-0147, same source; Home address, 4521 Brooklyn Ave NE, Apt 3B, "Your personal info PDF"; Employer, Northwind Robotics, "Your resume in Google Drive". Under them, slide 11's control row rendered once on the first card: Edit, Remove, Censor. And slide 11's honest state as a fifth, quieter card: Transfer PIN, "Not found. Type it or leave it blank." Caption from slide 6: "Formly reads what you connect and finds each answer, so you don't have to remember it." This section answers "what if it gets an answer wrong?" without asking the question.

6. **How Formly fills a form** (slide 9). Four steps in a row (stacked on mobile): Read ("Gemini reads your PDFs, photos and docs"), Twin ("One profile, every fact tagged with its source"), Fill ("The business's form plus your twin gives the answers"), You review and approve ("Answers drop into the form"). A thin connector line between steps; the fourth step gets the only green accent in the section, because approval is the moment of completion and the brand guide reserves green for that.

7. **The business gets answers, not accounts** (slide 12). Ink background. Two columns, "Your side" (your documents and accounts, your twin) and "Their side" (the finished form only). Between them the permission prompt from the slide, rendered as a real-looking card: "T-Mobile is asking for your IDs (SSN, driver's license)" with Allow once / Always allow / Deny, and the shortcut hints 1, 2, 3 as in the app. Below: the five groups Formly asks about (Contact and address, IDs, Payment card, Work and income, Plan and device) and the one-line rule: "Auto mode asks before IDs and cards. Share everything never asks."

8. **For businesses: one button, one schema** (slides 10 and 14). Paper background. Three numbered steps from slide 10 and the code line in a code block: `<FormlyButton schema={signup} onFilled={fill} />`. Beside it the pricing from slide 14 as two small cards: Person, Free. Business, pays per completed form. One line: "Each finished sign-up is worth real money to the business. For a carrier, about $1,835 a year per account" with "our estimate from public filings" in Slate. No pilot ask, no $940M.

9. **Others fill a slice. Formly fills the form** (slide 13). A four-row comparison, plain text, no checkmark grid: Browser autofill, fills name, address and card. Password managers, fill logins and saved identities. Plaid, shares bank data with apps. Formly, fills any field, from your own documents, with a source and your approval. The Formly row is the only one with the green left edge.

10. **Your twin works everywhere** (slide 17). "Connect once, fill every form. One company alone can't offer that." Four merchant tiles linking to the demo forms that exist in the repo: T-Mobile (`/tmobile`), a bank (`/chase`), an airline or the third demo (`/spacexai`, label it by what the page actually is), and "a landlord" as a non-link placeholder tile if no demo exists. Check each route before linking.

11. **Race us** (slide 2). One full-width band: "The usual way vs Fill with Formly. Same form, two phones, sixty seconds." Button "Start the race" to `/race`. This is the page's second call to action and the natural end of the scroll.

12. **Built in 24 hours** (slide 15) and footer (slide 16, slide 1 names). Two short lists, "Live today" and "Next", verbatim from the slide. Footer: "Formly. Built at DubHacks 2026 for the T-Mobile track by Khangai Sukhbaatar, Salvo Bonsma and Jerry Zheng." One line of stack: "Next.js, TypeScript, Gemini, SQLite, Docker on Dokploy." Link to the GitHub repo.

## Design rules (from the brand guide, which outranks taste)

- Colors: Ink `#0F1A2A`, Fern `#0FA968` on light, Volt `#22C985` on dark, Paper `#F6F7F9`, Mist `#E9ECF1`, Line `#CBD1DA`, Slate `#5B6575`. These already exist as `--navy`, `--green`, `--bg` etc. in `globals.css`; add Paper, Mist, Line, Slate, Volt as tokens if missing rather than hardcoding.
- Green is for the mark's bars and moments of completion. On this page that means: filled fields, the approve step, the Formly row in the comparison, the "33 of 33" counter. Not for decoration, not for section backgrounds.
- Fern on white is 3.0:1, so never small Fern text on light. Volt on Ink is fine.
- Sora SemiBold 600 for headlines and buttons (the `h1, h2` rule and `font-display` are already wired), DM Sans for everything else. Display 48px, heading 28px, body 16px at 150% line height, label 13px medium. Scale display down to 36px under 640px.
- Sentence case. Plain words. Nothing ornamental. No gradients, no glassmorphism, no emoji.
- Sections alternate Ink and Paper so the page has rhythm: hero Ink, 2 to 6 Paper, 7 Ink, 8 to 11 Paper, 12 Ink.
- Buttons: 12px radius, 52px tall for the hero and race CTAs (the brand's button spec). The `Fill with Formly` button in the hero mock uses the real `Mark` component and exact label.
- Motion: typewriter and fill animations only. Everything respects `prefers-reduced-motion`. Nothing autoplays sound. No scroll-jacking.
- Mobile first: 16px side gutters, no horizontal scroll at 375px, tap targets at least 44px. Check 375px and 1280px.
- Performance: no new dependencies. Fonts already load through `next/font`. No images except the existing SVG mark. Keep the page a server component with small client islands for the typewriter, the hero fill animation and the autofill toggle.
- Accessibility: one `h1`, section `h2`s, the toggle is a real `role="radiogroup"` or two buttons with `aria-pressed`, stat numbers have visible units and sources, color is never the only signal (filled fields also get the green left edge, empty fields the dashed outline).

## Out of scope

Pricing figures per form, a sign-up form on the landing page, the T-Mobile pilot ask, testimonials, a blog, analytics.

## Done means

`/` renders the twelve sections in order at 375px and 1280px with no console errors, `npm run build` passes, `npm run lint` passes, every internal link resolves to an existing route, the three client islands degrade without JS, and a reduced-motion check shows the finished states.
