# Formly pitch deck

- `Formly-deck.pptx`: the deck. Open it in PowerPoint. `Formly-deck.pdf` shows the 8 slides presented at the booth.
- Slides 1-8 are the booth pitch (about 2 minutes of talk, the rest is questions): title, retyping, forms lose people, Formly converts, the answers exist, autofill stops, bring Formly to T-Mobile, and the race last. Slides 9-17 are hidden answer slides: in slideshow mode, type the number and press Enter (the jump list is in slide 7's notes). Speaker notes hold the timed cues.
- Slide 8 QR codes: both go to https://formly.select/tmobile (A types the form manually, B taps Fill with Formly). This assumes the app is deployed at formly.select; if the address changes, rebuild (below).
- `build/pptx_formly.py` rebuilds the deck from `Formly-gslides-export.pptx` and `brand/png/`. Run `python3 deck/build/pptx_formly.py` from the repo root (needs `pip install python-pptx lxml`). Edits made by hand in PowerPoint are overwritten on rebuild unless they are added to the script.
- `brand/`: Formly brand guidelines, lockups and app icon. Ink #0F1A2A, Fern #0FA968 on light, Volt #22C985 on dark. Sora SemiBold for headlines and buttons, DM Sans for body text.

## Fonts

Sora, DM Sans, Inter and Inter Display are embedded in `Formly-deck.pptx` (PowerPoint 2019 / Microsoft 365 and PowerPoint for Mac 16.17 or later read them). If a machine still shows a fallback font, install them from Google Fonts and restart PowerPoint:

- https://fonts.google.com/specimen/Sora (static SemiBold and Medium)
- https://fonts.google.com/specimen/DM+Sans (Regular, Medium, Bold)

## Rebuilding after a copy change

`deck/build/fix_deck.py` applies the Discord fixes (QR codes, slide order, slide 1/5/7/8 copy, button font, font embedding) to a pristine deck and is safe to rerun. From the repo root:

```
python3 deck/build/fix_deck.py <pristine.pptx> deck/Formly-deck.pptx https://formly.select/tmobile https://formly.select/tmobile
```

Needs python-pptx, fontTools and `uvx` (for segno), plus Sora, DM Sans, Inter and Inter Display in `~/Library/Fonts`.

## Still to fill in

- A price per completed form on hidden slide 14 (the placeholder was removed)
