# Synthetic test inboxes

Nine fictional people with realistic inboxes and known right answers, for scoring Formly's fill.

- People: 8 from [NVIDIA Nemotron-Personas-USA](https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA) (CC BY 4.0, fully synthetic, census-grounded), plus a hand-made student (Kai Moreno) on a parent's family plan with a campus mailbox and a shared Apple ID.
- Each folder: `inbox/*.eml` (carrier bills, shipping confirmations, streaming receipts, a travel or pharmacy email with the date of birth, plus noise and traps: a family member's forward and a gift shipped to someone else) and `truth.json` (facts, acceptable suggestions, fields that must stay blank, and the trap person whose details must never appear).
- All contact details are fictional: 555-01xx phone numbers, example.com emails.

Regenerate: `node --env-file=.env.local scripts/synth/personas.mjs` then `SYNTH_MODEL=gemini-3.5-flash-lite node --env-file=.env.local scripts/synth/generate.mjs`.
Score (dev server running): `node scripts/synth/eval.mjs [slug...]`. Results land in `results/latest.json`.
