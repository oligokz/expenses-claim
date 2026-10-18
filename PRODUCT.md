# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Every CREOX Computing Singapore employee. They file expense claims, leave requests, travel requests and purchase requisitions a few times a month, mostly from a phone, often between other work and with little patience for forms. They are not finance specialists. They sign in with their Microsoft 365 work account, so their identity is known and locked.

A handful of managers approve requests, again mostly on a phone, usually by tapping a link in an email or the Approvals tab. Finance and HR process expense claims in SharePoint; expense claims have no approver in the app.

## Product Purpose

CREOX Staff Portal (app.creoxtech.com) is the company's request portal: four forms, a list of each person's own requests, and an inbox for approvers. A request goes in, is routed to the right approvers in order, and ends approved or rejected, with a signed PDF for purchase requisitions and travel requests. Success means a staff member files a correct, complete request on the first try, always knows where it stands, and never has to chase it by email.

## Positioning

It replaces paper forms and emailed requests. It lives entirely inside the company's Microsoft 365: staff sign in with their work account, every request is a row in a SharePoint list with its files in a SharePoint library, approvals go out by email from the company mailbox, and signed PDFs are stored alongside. There is no new system to learn, license or keep in sync.

## Operating Context

- Mostly used on phones at around 375px wide; desktop is secondary.
- Approvers arrive from an approval email or the Approvals tab; the approval link is single-use and works only for the named approver.
- Finance and HR read and process records in the SharePoint "Forms" site.
- Light and dark themes, following the device by default.

## Capabilities and Constraints

- Four request types: expense claim (one expense per claim, processed by Finance), leave (one approver), purchase requisition (one approver, signed PDF), travel (Reporting Manager, then Finance/HR, then Final Approval, signed PDF). The travel roles are fixed as the customer specified.
- Singapore company: SGD is the base currency, other currencies are converted at submission, and dates and times are Singapore time.
- Requesters can see who has a request, send a reminder, and delete a request nobody has approved yet.
- Hosted on Vercel's Hobby plan, which allows at most 12 API functions; the app uses all 12.

## Brand Commitments

- Name and logo: CREOX.
- Voice: formal, short and exact. No filler or helper text that states the obvious, no exclamation marks, no em dashes.
- Personality: composed, exact, dependable. The interface should feel like a well-made financial instrument, not a marketing site.
- Anti-references: clunky enterprise portals (SAP, Concur: dense grey grids, cryptic codes); flashy consumer apps (gradients, hero metrics, playful illustration); generic AI-made dashboards (identical card grids, tracked-uppercase eyebrows, glassmorphism).

## Evidence on Hand

- Logo files: `public/logo.svg`, `public/creox.png`.
- No testimonials, metrics or case studies exist; do not invent any.

## Product Principles

- **Phone first.** Every screen works at phone width before anything else.
- **Always know where it stands.** A request's status, who has it and what happens next are visible without asking anyone.
- **Never lose input.** Validate clearly, explain plainly, and keep what the person typed.
- **Trustworthy with money and dates.** Totals, conversions and dates are exact, in SGD and Singapore time, and match what is stored.
- **Say it once, formally.** Copy is short and only says what the screen does not already show.

## Accessibility & Inclusion

Target WCAG 2.1 AA in both light and dark themes: body text at least 4.5:1, large text at least 3:1, full keyboard use with visible focus rings, and `prefers-reduced-motion` respected. Tap targets are at least 40px on phones.
