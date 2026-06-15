---
name: CorpExpense
description: A composed, exact, dependable expense-claim tool — Manrope throughout, black & white worksheet, vivid blue action, near-black service counter.
colors:
  app-bg: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  blue-primary: "oklch(0.546 0.245 262.881)"
  card-white: "oklch(1 0 0)"
  gray-surface: "oklch(0.967 0.001 286.375)"
  muted-ink: "oklch(0.556 0 0)"
  border: "oklch(0.922 0 0)"
  counter-black: "oklch(0.205 0 0)"
  counter-muted: "oklch(0.708 0 0)"
  success-teal: "oklch(0.62 0.13 165)"
  warning-amber: "oklch(0.78 0.15 80)"
  destructive-red: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 1.875rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.03em"
  mono:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "7px"
  md: "8.5px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue-primary}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-submit:
    backgroundColor: "{colors.blue-primary}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    height: "48px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "32px"
  input-field:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  section-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  counter-panel:
    backgroundColor: "{colors.counter-black}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.xl}"
---

# Design System: CorpExpense

## 1. Overview

**Creative North Star: "The Concierge Desk"**

CorpExpense feels like being waved over to a competent service counter and handed off to someone who already knows who you are. The crisp near-white field (`oklch(0.985 0 0)`) is the welcome surface — calm, lit, unhurried, and deliberately neutral (zero chroma, no warm tint). The near-black panels (`oklch(0.2 0 0)` — the top bar and the live-rates panel) are the polished desk between you and the work: the place where the system quietly handles things on your behalf. **Bright blue (`oklch(0.52 0.2 255)`) is the ink** — it appears only where the system wants your hand: the Submit action, focus, the current selection. Your identity arrives pre-filled, exchange rates refresh themselves, and exactly one next action is ever prominent. You don't operate this tool so much as you're attended by it.

The system is **composed, exact, and dependable**. Composed: nothing flickers, nothing shouts, surfaces are flat at rest. Exact: every figure is tabular and mono, every total legible before you commit to it. Dependable: states are honest and complete, input is never lost. The palette is strictly black-and-white so the one blue reads instantly as "act here"; the polish lives in restraint and precision — alignment, rhythm, contrast, considered states — not in flourish.

This system explicitly rejects three things. It is **not** clunky legacy enterprise (SAP / Concur): no dense gray clutter, no cryptic field codes, no dated chrome. It is **not** flashy consumer/startup: no gradients, no hero-metric theater, no playful illustration competing with money. And it is **not** generic AI-slop dashboard: no identical card grids, no tracked-uppercase eyebrow above every block, no decorative glass.

**Key Characteristics:**
- Black-and-white (chroma-0) surfaces + bright-blue action as the whole color story
- Near-black service counter (top bar, rates) anchors the neutral worksheet
- Flat at rest; depth comes from tonal layering and hairline borders, not heavy shadow
- Tabular/mono figures everywhere a number must be trusted
- One clearly dominant next action per screen — and it is the only blue thing
- Generously rounded corners (14–20px) carrying the "soft, made-with-care" tone
- First-class dark mode; both themes independently pass contrast

## 2. Colors

A strict black-and-white system with one bright blue. Surfaces are true neutrals (chroma 0) — crisp white worksheet, near-black counter — and **blue is the single accent**, reserved for action and state. Two semantic colors (teal success, amber warning) and red for errors appear only as small status signals, never as decoration. Blue holds ~5–10% of any screen; its rarity is what makes it read as "act here."

### Primary
- **Bright Blue** (`oklch(0.52 0.2 255)`): the one voice of action. Carries the primary button, the Submit CTA, focus rings, the current selection, and any link. White text on it clears AA (5.55:1); the same blue on white serves as accessible link text (5.31:1). This is the only chromatic color the user is meant to *act on*; its scarcity (~5–10% of a screen) is the entire point.

### Neutral (the black-and-white system)
- **App Background** (`oklch(0.985 0 0)`): crisp near-white field. True neutral — chroma 0, no warm tint.
- **Card White** (`oklch(1 0 0)`): pure white worksheet cards floating a half-step above the field.
- **Ink** (`oklch(0.18 0 0)`): near-black body and heading text.
- **Gray Surface** (`oklch(0.96 0 0)`): secondary surface — icon chips in section headers, secondary-button rest.
- **Muted Ink** (`oklch(0.44 0 0)`): neutral-gray secondary text — labels, captions, helper copy. Measured ≥6.9:1 on every surface it sits on.
- **Border** (`oklch(0.92 0 0)`) / **Input Border** (`oklch(0.9 0 0)`): hairline dividers and field strokes; the system's primary depth cue.
- **Blue Wash** (`oklch(0.95 0.03 255)`): a faint blue tint for hover / selected rows — the only place neutrals lean off true gray, and only toward the brand blue.

### Counter (the near-black desk surface)
- **Counter Black** (`oklch(0.2 0 0)`): the dark panel fill (rates panel, top bar). Neutral, not charcoal-warm.
- **Counter Muted** (`oklch(0.7 0 0)`): secondary text on black (6.8:1).
- **Counter Border** (`oklch(1 0 0 / 0.1)`): translucent white hairlines and chip fills (`white/5`, `white/10`) layered on black.

### Semantic (small status signals only)
- **Success Teal** (`oklch(0.62 0.13 165)`): live / succeeded / confirmed — the pulsing rates dot, the receipt "Ready" badge, the confirmation check. Dark text on it for AA (5.5:1).
- **Warning Amber** (`oklch(0.78 0.15 80)`): the "using cached rates" status dot only.
- **Destructive Red** (`oklch(0.585 0.205 27)`): validation errors and destructive actions. Inline error text and field-invalid states.

### Named Rules
**The One Blue Rule.** Blue is the only chromatic accent and it means *act / selected / focused*. It carries the primary actions and nothing decorative. Do not introduce a second accent hue to compete with it; the black-and-white field is what gives the blue its power.

**The Neutral-Surface Rule.** All surfaces are true neutrals (chroma 0). The only permitted tint is **toward the brand blue** (the blue wash on hover/selection) — never toward warm/cream. If a surface looks beige, it's wrong.

**The Semantic-Only Rule.** Teal, amber, and red are status signals, not palette colors. They appear only when something succeeded, went stale, or failed. If one shows up and nothing happened, it's wrong.

## 3. Typography

**One Family:** Manrope (with ui-sans-serif, system-ui fallbacks) — used for everything: display, titles, body, labels, and figures.

**Character:** Manrope is a clean, slightly-rounded geometric sans that reads as modern and trustworthy at every size. A single family keeps the worksheet quiet and cohesive; hierarchy is carried by weight and size, not by mixing typefaces. Figures use Manrope's `tabular-nums` so currency and rate readouts still align in ruled columns.

### Hierarchy
- **Display** (Manrope 700, `clamp(1.5rem, 3vw, 1.875rem)`, `-0.02em`): the page title ("New Expense Claim"). Bold and prominent — the anchor of the screen.
- **Title** (Manrope 600, 0.875rem, `-0.01em`): section-card headers ("Claimant", "Expense", "Receipts").
- **Body** (Manrope 400, 0.875rem, line-height 1.5): field values, descriptions, helper text. Cap prose at 65–75ch.
- **Label** (Manrope 600, 0.625rem, `+0.03em`, often uppercase): field labels, the "Base Currency · SGD" eyebrow on the counter panel, micro-captions.
- **Figures** (Manrope 600, ~0.8125rem, `tabular-nums`): exchange-rate readouts, the running total, any committed figure.

### Named Rules
**The Tabular-Money Rule.** Every number that represents money or a rate uses `tabular-nums`. Figures must align vertically and never jitter as digits change.

**The One-Family Rule.** Manrope only. Don't introduce a second typeface; contrast comes from weight (400 / 600 / 700) and size, not from pairing.

## 4. Elevation

Flat by default. Depth is built from **tonal layering and hairline borders**, not from heavy drop shadows. Cards sit a half-step above the field with `shadow-sm` and a `1px` neutral border; the near-black counter panels use translucent white hairlines (`oklch(1 0 0 / 0.1)`) and faint white fills (`white/5`, `white/10`) to layer content. Buttons and inputs carry only `shadow-xs` — barely there, enough to lift them off the field.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)` — Tailwind `shadow-sm`): the resting elevation of worksheet cards and the counter panel.
- **Control lift** (`shadow-xs`): inputs and outline/secondary buttons; a near-invisible edge.

### Named Rules
**The Flat-At-Rest Rule.** Surfaces are flat until something happens. Elevation and ring are responses to state — hover, focus — not ambient decoration. If a shadow looks like it's trying to be seen, it's too dark.

**The Hairline-Depth Rule.** A `1px` neutral border does the structural work that a shadow would do in a heavier system. On the near-black counter, that hairline is translucent white. Prefer the border to the blur.

## 5. Components

### Buttons
- **Shape:** gently rounded (`rounded-md` ≈ 12px).
- **Primary:** bright-blue fill (`oklch(0.52 0.2 255)`), white text, `h-9` (36px), `px-4`; icon + label with `gap-2`. Hover via `bg-primary/90`.
- **Submit (signature):** the same blue, scaled up to `h-12` (48px), full-width, `font-semibold`, with a leading `Send` icon that swaps to a spinner while submitting. It is the single most prominent control — the only blue thing at rest, and the "one clear next action." On mobile it also appears in a sticky bottom action bar.
- **Ghost / Secondary:** transparent or gray-surface rest, `hover:bg-accent` (the faint blue wash). Used for sign-out and low-stakes actions. On the counter panels, ghost buttons use `hover:bg-white/10`.
- **Hover / Focus:** all buttons `transition-all`; focus-visible draws a `3px` **blue** ring at `ring/50` plus a border shift. Never remove the ring.

### Inputs / Fields
- **Style:** `h-9` (36px), `rounded-md` (≈12px), `1px` neutral input-border, white (light) / `input/30` (dark) fill, `px-3`, `shadow-xs`.
- **Focus:** border shifts to the blue ring and a `3px` blue `ring/50` glow appears (`transition-[color,box-shadow]`). Calm, no jump.
- **Error / Invalid:** `aria-invalid` switches border to destructive red with a `destructive/20` ring, paired with an inline `aria-describedby` message. Numeric fields use `tabular-nums`.
- **Dates:** a dd/mm/yyyy text field (masked as you type) with a calendar button opening the native picker; the value is stored as ISO `yyyy-mm-dd`.

### Cards / Containers
- **Corner Style:** `rounded-xl` (≈20px) — the most generous radius in the system.
- **Background:** card-white on the neutral field.
- **Shadow Strategy:** `shadow-sm` + `1px` neutral border (see Elevation).
- **Internal Padding:** `p-5` (20px) body; never nest a card inside a card.

### SectionCard (signature component)
The worksheet's organizing unit. A `rounded-xl` white card with a **header strip**: a `size-7` gray-surface icon chip (`rounded-lg`, muted-ink icon) + an Inter-600 title, a `1px` bottom border, then a `p-5` body. `gap-0`, `overflow-hidden`, edge-to-edge body supported for tables. This is how every form section is framed — consistent, quiet, scannable.

### Counter Panel (signature component)
The near-black "desk" device. A `rounded-xl` `oklch(0.2 0 0)` `section` with translucent-white hairline borders, a header row (icon chip on `white/10` + Inter-600 title + a `size-8` rounded refresh control on `white/5`), and a body of mono/tabular rate tiles in a 2-col grid. A live-status footer pairs a pulsing teal dot (amber when cached) with plain-language status ("Live · Updated 14:32"). The top bar shares this surface so the two read as one continuous counter.

### Confirmation (signature component)
After submit, a centered card replaces the form: a teal success check, the **claim reference** in the near-black counter block with a copy button, the committed SGD total, and an honest receipt status (all-uploaded, or a destructive-tinted panel listing failures with a retry). A blue "File another claim" button closes it. This is the durable proof-of-record.

### Navigation / Top Bar
Sticky near-black header (`h-14`), logo left, truncated user name + ghost sign-out right. No nav menu — this is a single-task tool. The black ties it visually to the rates counter.

## 6. Do's and Don'ts

### Do:
- **Do** keep bright blue as the only chromatic accent — primary/Submit actions, focus rings, current selection, links — and nothing decorative (The One Blue Rule).
- **Do** keep all surfaces true neutral (chroma 0); the only permitted tint is the blue wash on hover/selection (The Neutral-Surface Rule).
- **Do** set every money/rate figure in JetBrains Mono with `tabular-nums` so columns align and digits never jitter (The Tabular-Money Rule).
- **Do** keep exactly one dominant action per screen — the full-width `h-12` blue Submit (sidebar on desktop, sticky bottom bar on mobile).
- **Do** build depth from `1px` neutral borders and tonal layering; reach for shadow only as a state response (The Flat-At-Rest Rule).
- **Do** preserve the `3px` blue focus ring on every interactive element; it is the accessibility baseline, not decoration.
- **Do** keep muted-ink (`oklch(0.44 0 0)`) neutral; it is measured ≥6.9:1 on every surface. Placeholder text uses the same token.
- **Do** treat dark mode as first-class — check contrast independently in both themes.
- **Do** respect `prefers-reduced-motion` on the spinner, the pulsing status dot, and any future transition.

### Don't:
- **Don't** inherit clunky legacy-enterprise energy (SAP / Concur): no dense gray field grids, no cryptic codes, no dated chrome. This is the thing being replaced.
- **Don't** drift flashy-consumer: no gradients, no `background-clip: text` gradient text, no big hero-metric template, no playful illustration competing with money.
- **Don't** ship generic AI-slop: no identical card grids, no tiny tracked-uppercase eyebrow above every section, no decorative glassmorphism.
- **Don't** nest a card inside a card — the SectionCard is the single framing unit.
- **Don't** use a `border-left`/`border-right` greater than `1px` as a colored accent stripe on cards, rows, or callouts. Use full hairline borders or background tints instead.
- **Don't** introduce a second accent hue to compete with the blue, and don't use blue for anything that isn't an action/selection (The One Blue Rule).
- **Don't** tint surfaces warm/cream; if a surface looks beige, it's wrong (The Neutral-Surface Rule).
- **Don't** let display type exceed ~1.5rem; this is a worksheet, not a billboard (The Quiet-Title Rule).
- **Don't** use light-gray body text "for elegance." Legibility of the number and the label is the entire job.
