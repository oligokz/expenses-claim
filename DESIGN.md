---
name: CREOX Staff Portal
description: A composed, exact, dependable request portal. Manrope throughout, black-and-white surfaces, one vivid blue for action, built for phones first.
colors:
  action-blue: "oklch(0.546 0.245 262.881)"
  action-blue-text: "oklch(0.546 0.245 262.881)"
  action-blue-text-dark: "oklch(0.72 0.14 262.881)"
  blue-wash: "oklch(0.95 0.03 262.881)"
  paper: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  muted-ink: "oklch(0.52 0 0)"
  quiet-surface: "oklch(0.967 0.001 286.375)"
  hairline: "oklch(0.922 0 0)"
  night: "oklch(0.145 0 0)"
  night-card: "oklch(0.205 0 0)"
  night-ink: "oklch(0.985 0 0)"
  night-muted-ink: "oklch(0.708 0 0)"
  counter-black: "oklch(0.205 0 0)"
  brand-navy: "#0A1F8F"
  success-teal: "oklch(0.62 0.13 165)"
  success-teal-text: "oklch(0.48 0.1 165)"
  warning-amber: "oklch(0.78 0.15 80)"
  warning-amber-text: "oklch(0.5 0.12 65)"
  destructive-red: "oklch(0.53 0.2 27)"
typography:
  display:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
  figure:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    fontFeature: "tnum"
rounded:
  sm: "7px"
  md: "8.5px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "32px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
  chip-filter-active:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    height: "32px"
  chip-filter:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.full}"
    height: "32px"
  top-bar:
    backgroundColor: "{colors.counter-black}"
    textColor: "{colors.night-ink}"
    height: "56px"
---

# Design System: CREOX Staff Portal

## Overview

**Creative North Star: "The Concierge Desk"**

CREOX Staff Portal feels like being waved over to a competent service counter by someone who already knows who you are. Your name arrives filled in and locked, the right approvers are a tap away, and exactly one next action is ever prominent. The white field is calm and unhurried; the near-black top bar is the desk between you and the paperwork, where the system quietly handles things on your behalf. Vivid blue is the ink: it appears only where the system wants your hand.

The system is composed, exact and dependable. Composed: surfaces are flat at rest and nothing shouts. Exact: every amount uses tabular figures and every date is Singapore time. Dependable: a request's status, who has it and since when are always visible, and input is never lost. It is built for a phone held in one hand: the figure that matters and the Submit button sit in the thumb zone, above a four-slot bottom bar.

It rejects clunky enterprise portals (dense grey grids, cryptic codes), flashy consumer apps (gradients, hero metrics, playful illustration) and generic AI-made dashboards (identical card grids, tracked-uppercase eyebrows, decorative glass).

**Key Characteristics:**
- Black-and-white surfaces with one vivid blue for action, selection and focus
- Phone first: sticky total and Submit bar, bottom tab bar, 40px minimum tap targets
- Flat at rest; depth from hairline borders and a faint card lift
- Tabular figures for every amount
- One SectionCard frame for every form section; cards for every request in a list
- Light and dark themes, both passing WCAG AA

## Colors

A strict black-and-white system with one vivid blue. Small semantic colours signal status only, and each request type carries one fixed, non-blue tint so a list can be scanned by kind.

### Primary
- **Action Blue** (action-blue): the primary button, the sticky Submit, the active filter chip, focus rings and the current tab. Buttons keep this vivid fill in both themes.
- **Action Blue as Text** (action-blue-text, action-blue-text-dark in dark mode): links, "Show progress", "View all rates" and blue icons. Dark mode uses the lighter value because the vivid blue is only 3.4:1 on the dark card.
- **Blue Wash** (blue-wash): hover and selected states; the only place a surface leans off grey.

### Neutral
- **Paper** (paper): cards and the light page background.
- **Ink** (ink): headings and body text.
- **Muted Ink** (muted-ink): secondary text, labels and captions (5.5:1 on white).
- **Quiet Surface** (quiet-surface): icon tiles in card headers, secondary buttons, the Pending status pill.
- **Hairline** (hairline): borders and dividers, the main depth cue.
- **Night, Night Card, Night Ink, Night Muted Ink**: the dark theme's page, card and text values.
- **Counter Black** (counter-black): the top bar in both themes.

### Semantic
- **Success Teal** (success-teal, text in success-teal-text): Approved status, Done steps in the timeline, confirmation ticks.
- **Warning Amber** (warning-amber, text in warning-amber-text): the "waiting more than three days" chip on approval cards, and cached rates.
- **Destructive Red** (destructive-red): validation errors, Rejected status, delete actions.

### Request-type tints
Each request type has one fixed tinted chip (background at about 10% opacity, text in the same hue's dark shade, light shade in dark mode). These are the one permitted exception to the One Blue Rule and may never be blue, green, teal, amber or red, which already carry meaning.
- Expense: violet. Leave: stone. Travel: fuchsia. Purchase: orange.

### Brand navy
The company navy from creoxtech.com (brand-navy) fills the band behind the white logo on the sign-in screen, and nowhere else. It is identity, not action: the Sign in button there keeps Action Blue.

### Named Rules
**The One Blue Rule.** Blue means act, selected or focused, and nothing else. No decorative blue, and no second accent hue competing with it.

**The Semantic-Only Rule.** Teal, amber and red appear only when something succeeded, is waiting too long or failed. If one shows up and nothing happened, it is wrong. A money total is never red.

**The Neutral-Surface Rule.** Surfaces are true neutrals. The only tint allowed is the blue wash on hover or selection.

## Typography

**Font:** Manrope (with ui-sans-serif, system-ui fallbacks) for everything, figures included.

**Character:** a clean, slightly rounded geometric sans that reads as modern and trustworthy. One family keeps the app quiet; hierarchy comes from weight and size.

### Hierarchy
- **Display** (700, 1.5rem on phones up to 1.875rem, -0.02em): page titles such as "Purchase Requisition".
- **Headline** (600, 1.25rem): confirmation and outcome headings ("Approved", "Leave request submitted").
- **Title** (600, 15px): the title line of a request card; SectionCard headers use 600 at 0.875rem.
- **Body** (400, 0.875rem, line-height 1.5): field values, descriptions, page subtitles.
- **Caption** (400, 0.75rem): dates, secondary card lines, timeline sub-lines, error messages.
- **Label** (600, 11px, sentence case): badges, chips, small field labels, the sticky bar's caption. Never uppercase.
- **Figure** (700, 1.125rem, tabular-nums): totals in the sticky bar and on cards; 1.5rem on the approval summary.

### Named Rules
**The Tabular-Money Rule.** Every amount and rate uses tabular figures so digits never jitter.

**The Sentence-Case Rule.** Labels, buttons, chips and headings are sentence case. No tracked-uppercase eyebrows.

**The Quiet-Title Rule.** Titles stay at or below 1.875rem. This is a worksheet, not a billboard.

## Layout

Phone first at 375px, with 16px side gutters. Forms are a single column capped at 672px (max-w-2xl); My Requests at 768px; Approvals at 1024px as a one-column list on phones and a two- or three-column grid from 640px. Sections stack with 20px gaps; cards use 16px padding.

On phones a four-slot bottom bar (New, My Requests, Approvals, More) is fixed at the bottom, and every form adds a sticky bar above it with the figure that matters (total, days or estimated cost) and the Submit button. From 640px up, the top tab bar replaces the bottom bar and each form shows its own inline Submit.

Every form follows one order: Your Details, the request's specifics with its total, free text, attachments, then Approval just above Submit.

## Elevation & Depth

Flat by default. Cards sit on the page with a 1px hairline border and a faint lift (shadow-sm); controls carry an even fainter one (shadow-xs). Sheets and menus use a stronger shadow and a dimmed overlay. Dark mode relies on the card being one step lighter than the page, plus translucent white hairlines.

### Named Rules
**The Flat-At-Rest Rule.** Shadow responds to state or marks a floating layer; it is never ambient decoration.

**The Hairline-Depth Rule.** A 1px border does the structural work a heavier system would give to shadow.

## Shapes

Gently rounded throughout: controls at about 8.5px, cards and panels at 14px, chips, badges, pills and avatars fully round. Dashed 2px borders mark drop zones and the signature pad. No left or right accent stripes on cards.

## Components

### Buttons
- **Shape:** gently rounded (rounded.md).
- **Primary:** Action Blue fill, white text, 48px tall for Submit and decision buttons, full width when stacked on phones.
- **Outline:** paper fill with a hairline border, 32px for small actions such as Remind and Review.
- **Ghost icon:** 40px on phones and 32px from 640px, for delete, PDF and remove-file.
- **Focus:** a 3px blue ring on every interactive element.

### Chips
- **Filter chips:** fully round, 32px; active is Action Blue with white text, inactive is paper with muted ink. The period picker uses the same pill shape with a dropdown.
- **Status badges:** Pending in Quiet Surface, Approved in solid Success Teal, Rejected in solid Destructive Red.
- **Type chips:** the request-type tints above, with the type's icon.

### Cards / Containers
- **SectionCard:** the single framing unit for form sections; icon tile plus 0.875rem title in the header, hairline divider, 16px body. Never nest a card inside a card.
- **Request card:** 14px corners, hairline border, 16px padding. Top row: type chip and bold reference on the left, status and actions on the right. Then title and date with the amount opposite, then a row with Show progress and Remind.

### Inputs / Fields
- **Style:** 36px, hairline border, rounded.md, paper fill (a faint translucent fill in dark mode).
- **Focus:** blue ring.
- **Error:** red border with a caption-size message underneath; the first invalid field receives focus.
- **Placeholders:** only formats (Select ..., 0.00, dd/mm/yyyy, City, country), never helper prose.

### Navigation
- **Phone:** bottom bar with four slots, the active one in a blue-wash pill; New opens a sheet listing the four forms; More holds exchange rates, appearance and sign out, each as an icon-tile row.
- **640px and up:** a sticky top tab bar under the Counter Black header; Approvals shows a red count badge.

### Timeline (signature component)
Submitted, then each approver in order: a dot, the person's name, a status pill (Done, Pending, Upcoming, Rejected) and one plain sub-line ("Approved 15 Oct 2026, 10:00 am", "Waiting since ...", "After Jane Tan"). Steps still to come are dimmed with muted ink. The same timeline appears in My Requests, on the approval page and in decision emails.

### Sticky Submit bar (signature component)
Fixed above the phone bottom bar: a label and figure on the left, the Submit button on the right, respecting the safe-area inset.

### Signature pad
Matches the surrounding fields in both themes and draws in the theme's text colour; the saved image is always near-black ink on transparent for the signed PDF.

## Do's and Don'ts

### Do:
- **Do** keep vivid blue for actions, selection and focus only (The One Blue Rule).
- **Do** use tabular figures for every amount and show money in SGD with thousands separators.
- **Do** show dates as "15 Oct 2026" in Singapore time, and leave the time off date-only values.
- **Do** keep one dominant action per screen: the 48px blue Submit, in the sticky bar on phones.
- **Do** keep tap targets at least 40px on phones.
- **Do** check contrast in both themes; use the "-text" colour variants for coloured text.
- **Do** respect prefers-reduced-motion.

### Don't:
- **Don't** add helper text, placeholders or confirmation sentences that restate what the screen already shows.
- **Don't** use tracked uppercase labels or eyebrows.
- **Don't** colour a total or any neutral figure with a semantic colour.
- **Don't** give a request-type chip a blue, green, teal, amber or red tint.
- **Don't** nest a card inside a card, or add coloured side stripes to cards.
- **Don't** use gradients, glass effects or decorative illustration.
- **Don't** use em dashes in interface copy.
