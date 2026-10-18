# Formly pitch deck

- `Formly-deck.pptx` is the deck and the source of truth. It is now edited live in PowerPoint (partly with the Claude add-in). `Formly-deck.pdf` shows the slides presented at the booth.
- `build/pptx_formly.py` built an earlier version. It does not include the later PowerPoint edits, so running it would overwrite them. Don't rebuild from it.
- `CLAUDE-ADDIN-CONTEXT.md` is the brief to paste into the Claude add-in in PowerPoint before asking it to edit the deck (pitch, slide map, numbers and their sources, design rules).
- `brand/`: Formly brand guidelines, lockups and app icon. Ink #0F1A2A, Fern #0FA968 on light, Volt #22C985 on dark. Sora SemiBold for headlines and buttons, DM Sans for body text.

## Slides

Shown at the booth (about 2 minutes of talk, the rest is questions):

1. Title
2. Lets have a Race! (QR A by hand, QR B Fill with Formly)
3. You've typed this a hundred times.
4. Forms lose people. (70% of checkouts abandoned, Baymard 2025)
5. Formly converts. (by hand is a tangle, Formly is one line)
6. The answers already exist in your accounts.
7. Autofill stops where sign-ups get hard. (13 of 33 fields vs 30 of 33; 68% Signicat 2022; #1 port failure is the wrong account number)
8. Bring Formly to T-Mobile. (50%, ~5M, 10%, $940M; the math is in the speaker notes)

Hidden answer slides (in slideshow mode, type the number and press Enter): 9 isn't this just autofill?, 10 how it's built, 11 what works today, 12 is reading my inbox safe?

The "Questions?" slide that used to follow slide 8 is missing in this version.

## Fonts

Install Sora and DM Sans from Google Fonts before presenting, or turn on PowerPoint > Settings > Save > "Embed fonts in the file", then restart PowerPoint:

- https://fonts.google.com/specimen/Sora (static SemiBold and Medium)
- https://fonts.google.com/specimen/DM+Sans (Regular, Medium, Bold)

## Still to fill in

- QR codes and short links on slide 2
- The stack line and "what works today" on hidden slides 10 and 11
