# Formly pitch deck

- `Formly-deck.pptx`: the deck. Open it in PowerPoint. `Formly-deck.pdf` shows the 8 slides presented at the booth.
- Slides 1-8 are the booth pitch (about 2 minutes of talk, the rest is questions). Slides 9-12 are hidden answer slides: in slideshow mode, type the number and press Enter. 9 = isn't this just autofill?, 10 = how it's built, 11 = what works today, 12 = is reading my inbox safe? Speaker notes hold the timed cues.
- `build/pptx_formly.py` rebuilds the deck from `Formly-gslides-export.pptx` and `brand/png/`. Run `python3 deck/build/pptx_formly.py` from the repo root (needs `pip install python-pptx lxml`). Edits made by hand in PowerPoint are overwritten on rebuild unless they are added to the script.
- `brand/`: Formly brand guidelines, lockups and app icon. Ink #0F1A2A, Fern #0FA968 on light, Volt #22C985 on dark. Sora SemiBold for headlines and buttons, DM Sans for body text.

## Fonts

Install Sora and DM Sans from Google Fonts before presenting, or the slides fall back to a system font, then restart PowerPoint:

- https://fonts.google.com/specimen/Sora (static SemiBold and Medium)
- https://fonts.google.com/specimen/DM+Sans (Regular, Medium, Bold)

## Still to fill in

- QR codes and short links on slides 2 and 8
- Measured times `[m:ss]`, the field count `[N]` and the speed multiple `[X]`
- The stack line and "what works today" on hidden slides 10 and 11
