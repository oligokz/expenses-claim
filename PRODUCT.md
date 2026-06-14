# Product

## Register

product

## Users

Internal employees filing the occasional expense claim — not finance specialists, not daily power users. They open the form from a laptop a handful of times a year, usually right after a trip or a purchase, with a stack of receipts and limited patience. They are signed in via corporate Entra SSO, so their identity is known and locked. The job: get one expense claim filed correctly in a single sitting, with zero training and zero anxiety about "did I do this right?"

## Product Purpose

A single-claim expense submission tool. The user fills in their (pre-filled) identity, one expense line item with live currency conversion to SGD, attaches receipts, adds optional notes, and submits — the claim lands in SharePoint via Vercel serverless functions. Success looks like: a first-time user completes a correct, complete submission on the first try, understands the converted total before they hit submit, and never wonders whether it went through. It replaces a clunky enterprise/manual process; its reason to exist is to make a dreaded admin chore fast and unambiguous.

## Brand Personality

Calm, precise, trustworthy. Voice is plain and reassuring — short labels, no jargon, no exclamation marks. The interface should feel like a well-made financial instrument: quiet confidence, exact numbers, nothing decorative competing with the task. Three words: **composed, exact, dependable.** Emotional goal: the user feels in control and certain, never rushed or second-guessing.

## Anti-references

- **Clunky enterprise (SAP / Concur / legacy expense portals):** dense gray clutter, dozens of fields, cryptic codes, dated chrome. This is the thing being replaced — do not inherit its energy.
- **Flashy consumer / startup:** gradients, big hero-metric numbers, playful illustration, marketing flourish. Too informal and attention-seeking for a finance tool people must trust with money.
- **Generic AI-slop dashboard:** identical card grids, tiny tracked-uppercase eyebrows above every section, templated SaaS layout, decorative glassmorphism. Reads as machine-made; undermines the "this is a serious, made-with-care tool" signal.

## Design Principles

- **Certainty over decoration.** Every pixel should help the user trust the number and the outcome. Exact, tabular figures; unambiguous states; visible confirmation. Nothing decorative that doesn't aid the task.
- **One correct path.** A single-claim, single-line flow should feel obviously linear. Guide the user down it; make the required next action the most prominent thing on screen.
- **Quiet competence.** The polish shows in restraint and precision (alignment, rhythm, contrast, considered states), not in flourish. It should look made-with-care without looking like it's trying.
- **Forgiving by default.** Occasional users make mistakes. Validate clearly, explain plainly, and never lose their input. Error and edge states are first-class, not afterthoughts.
- **Trustworthy with money.** Currency, conversion, and totals must be legible, exact, and never surprising. The user always sees what they're committing to before they commit.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥4.5:1 contrast (watch the warm muted-gray foreground on warm off-white — verify, don't assume), large text ≥3:1. Full keyboard operability and visible focus rings (Radix primitives give a baseline; preserve it). Respect `prefers-reduced-motion` on every animation. **Dark mode is first-class** (wired via `next-themes`); both themes must independently pass contrast. Numeric/currency fields use tabular figures for scannability.
