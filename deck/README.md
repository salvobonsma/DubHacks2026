# Formly pitch deck

- `Formly-deck.pptx`: the deck. Open it in PowerPoint. `Formly-deck.pdf` shows the 7 slides presented at the booth.
- Slides 1-7 are the booth pitch (about 2 minutes of talk, the rest is questions). Slide 6 holds every number once (33 fields, 1 in 2, up to 50%, $1,835). Slides 8-11 are hidden answer slides: in slideshow mode, type the number and press Enter. 8 = isn't this just autofill?, 9 = how it's built, 10 = what works today, 11 = is reading my inbox safe? Speaker notes hold the timed cues. Slides fade in and out; slides 4-6 have short builds.
- `build/pptx_formly.py` rebuilds the deck from `Formly-gslides-export.pptx` and `brand/png/`. Run `python3 deck/build/pptx_formly.py` from the repo root (needs `pip install python-pptx lxml`). Edits made by hand in PowerPoint are overwritten on rebuild unless they are added to the script.
- `brand/`: Formly brand guidelines, lockups and app icon. Ink #0F1A2A, Fern #0FA968 on light, Volt #22C985 on dark. Sora SemiBold for headlines and buttons, DM Sans for body text.

## Fonts

Install Sora and DM Sans from Google Fonts before presenting, or the slides fall back to a system font, then restart PowerPoint:

- https://fonts.google.com/specimen/Sora (static SemiBold and Medium)
- https://fonts.google.com/specimen/DM+Sans (Regular, Medium, Bold)

## Still to fill in

- QR codes and short links on slides 2 and 7
- The stack line and "what works today" on hidden slides 9 and 10
