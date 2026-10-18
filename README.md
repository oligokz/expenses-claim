# CREOX Forms

Internal request portal for CREOX staff. People sign in with their Microsoft
work account and submit:

| Form | Reference | Approval |
| --- | --- | --- |
| Expense claim | `EXP-n` | None in the app. The claim lands as Pending and is handled in SharePoint. |
| Leave request | `LEAVE-n` | One approver, approve or reject |
| Purchase requisition | `REQ-n` | One or two approvers, drawn signature, signed PDF at the end |
| Travel request | `TRV-n` | Reporting manager, Finance/HR, final approval, signed PDF at the end |

Approvers get an email with a single-use link (`/approve?t=...`) and can also
find everything waiting for them under **Approvals** in the app. Requesters see
their own submissions under **My Requests** and can delete one while nobody has
approved it yet.

## How it fits together

```
Browser (Vite + React, MSAL)
   │  Bearer token for api://<SPA client id>/access_as_user
   ▼
Vercel functions in api/  ──►  Microsoft Graph (app-only)
                                 ├─ SharePoint lists     (one row per request)
                                 ├─ SharePoint library   (attachments, signatures, PDFs)
                                 └─ Mail.Send            (from MAIL_SENDER)
```

There is no database of its own: SharePoint is the system of record.

- `src/` is the single-page app. Tabs have their own paths (`/leave`,
  `/my-requests`, `/approvals`, `/rates`, ...); `vercel.json` rewrites them all
  to `index.html`.
- `api/*.js` are the endpoints. Every one verifies the user's Entra token
  (`api/_lib/sharepoint.js`) and takes identity from it, never from the body.
- `api/_lib/approvals.js` holds the approval state machine and the module
  registry: list names, stages and the columns each stage writes.
- `api/_lib/approvers.js` enforces who may be named as an approver, from the
  "Requisition Approvers" list.
- `scripts/setup-requisition-lists.mjs` creates the requisition lists and
  columns in SharePoint.
- `scripts/sp.mjs` signs in as you (device code, no secret) and checks the
  Forms site against what the code writes: missing columns, single-line
  columns that need multiple lines, unindexed columns, missing choice values.

  ```bash
  node scripts/sp.mjs audit --site https://creoxtech.sharepoint.com/sites/Forms
  ```

  Run it after adding a field to any form. It can also read rows (`items`) and
  make any Graph call (`graph`); anything but a GET needs `--yes`.

The Vercel Hobby plan allows 12 functions per deployment and `api/` has
exactly 12, so new endpoints should extend an existing file (the approvals
inbox is `GET /api/approval` without a token, for that reason).

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in the values
npx vercel dev               # serves the app and api/ together on :3000
```

`npm run dev` starts only the front end; the API calls will fail without
`vercel dev`. Add `http://localhost:3000` as a SPA redirect URI on the Entra
app registration and to `ALLOWED_ORIGINS`.

Checks:

```bash
npm run typecheck
npm run build
```

## Configuration

Every environment variable is listed with a comment in
[.env.example](.env.example). The Entra client and tenant ids used by the
browser are public and live in `src/lib/constants.ts`.

## Things to know

- Server-side figures are authoritative: totals, SGD conversion and leave days
  are recalculated in the API from server-fetched rates.
- Errors with a 5xx status are logged with the Vercel request id and the browser
  gets a generic message plus that id (`ref`). The Hobby plan keeps runtime logs
  for about an hour, so ask users for the ref and look straight away.
- Uploads accept PDF, JPG, PNG and HEIC/HEIF up to 4 MB each, and only against
  the uploader's own pending request.
- If the approver list can't be read, submissions that name an approver are
  refused (503) rather than accepted unchecked.
