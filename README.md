# CorpExpense — Expense Claim App

## Architecture

```
Browser (MSAL — ID token only)
        │
        │  POST /api/submit  (ID token in Authorization header)
        │  POST /api/upload  (ID token in Authorization header)
        ▼
Vercel API Routes  ◄── client secret stored in Vercel env vars
        │
        │  App-level token (client credentials flow)
        ▼
SharePoint REST API / Microsoft Graph
```

- The browser **never** gets a SharePoint token
- Users can only **submit** — they cannot read other people's claims
- The client secret lives only in Vercel environment variables

---

## Azure App Registration — Exact Permissions

In Azure Portal → App registrations → your app → **API permissions**:

### Required permissions

| API | Permission name | Type | Why |
|-----|----------------|------|-----|
| Microsoft Graph | `Sites.Selected` | **Application** | Write to your specific SP site only (most secure) |
| Microsoft Graph | `Files.ReadWrite.Selected` | **Application** | Upload to document library |

> **Why Application, not Delegated?**
> The API routes run server-side with no user context. Application permissions let the server act with its own identity using a client secret. The user's identity is verified separately via the ID token.

> **Why `Sites.Selected` not `Sites.ReadWrite.All`?**
> `Sites.ReadWrite.All` gives your app access to **every** SharePoint site in your tenant. `Sites.Selected` scopes it to only the sites you explicitly grant — far safer for production.

After adding `Sites.Selected`, you must grant it access to your specific site via PowerShell or Graph Explorer (step 2c below).

### Permission setup steps

**Step 2a — Add permissions in Azure Portal:**
1. App registration → API permissions → Add a permission
2. Microsoft Graph → Application permissions
3. Search and add: `Sites.Selected`
4. Search and add: `Files.ReadWrite.Selected`
5. Click **Grant admin consent for [your org]** ← requires Global Admin

**Step 2b — Create a client secret:**
1. App registration → Certificates & secrets → New client secret
2. Description: `CorpExpense Production`
3. Expires: 24 months
4. Click Add — **copy the Value immediately** (shown once only)
5. Put this value in your `.env.local` as `AZURE_CLIENT_SECRET`

**Step 2c — Grant Sites.Selected access to your SharePoint site:**

`Sites.Selected` requires an extra step — you must explicitly tell Microsoft Graph which site your app can access. Run this in PowerShell (requires PnP PowerShell module):

```powershell
# Install if needed
Install-Module PnP.PowerShell -Scope CurrentUser

# Connect to your SharePoint admin centre
Connect-PnPOnline -Url "https://creoxtech-admin.sharepoint.com" -Interactive

# Grant your app write access to the specific site
Grant-PnPAzureADAppSitePermission `
  -AppId "046120d8-89e0-45dd-94de-72f3e993708b" `
  -DisplayName "CorpExpense" `
  -Site "https://creoxtech.sharepoint.com/sites/Forms" `
  -Permissions Write
```

Or via Graph Explorer (https://developer.microsoft.com/en-us/graph/graph-explorer):
```
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
{
  "roles": ["write"],
  "grantedToIdentities": [{
    "application": {
      "id": "046120d8-89e0-45dd-94de-72f3e993708b",
      "displayName": "CorpExpense"
    }
  }]
}
```

---

## Project Structure

```
expense-app/
├── pages/
│   ├── _app.js           ← Next.js app wrapper (head/meta tags)
│   ├── index.js          ← Full UI (MSAL login + expense form)
│   └── api/
│       ├── submit.js     ← Writes claim to SharePoint list
│       └── upload.js     ← Uploads receipts to SharePoint library
├── lib/
│   ├── sharepoint.js     ← App-token + Graph API helpers (server only)
│   └── verifyToken.js    ← Validates user ID tokens (server only)
├── package.json
├── next.config.js
├── .env.local            ← Secrets — NEVER commit this file
├── .gitignore            ← .env.local is listed here
└── README.md
```

---

## Environment Variables

```

### Vercel — set these in Project Settings → Environment Variables
Add every variable from above. `AZURE_CLIENT_SECRET` is the sensitive one — Vercel encrypts it at rest and never exposes it to the browser.

---

## SharePoint Setup

### ExpenseClaims List
Create at: https://creoxtech.sharepoint.com/sites/Forms → New → List → Blank list → name: `ExpenseClaims`

| Column name     | Type                | Notes                      |
|-----------------|---------------------|----------------------------|
| Title           | Single line         | Auto-exists                |
| EmployeeName    | Single line         |                            |
| EmployeeEmail   | Single line         |                            |
| Department      | Single line         |                            |
| SubmissionDate  | Date and time       | Date only                  |
| TotalAmountSGD  | Number              | 2 decimal places           |
| LineItemsJSON   | Multiple lines      | Plain text                 |
| Notes           | Multiple lines      | Plain text                 |
| Status          | Choice              | Pending / Approved / Rejected |
| ReceiptCount    | Number              | Whole number               |
| ExchangeRates   | Multiple lines      | Plain text                 |
| SubmittedByOID  | Single line         | Azure AD object ID (audit) |

### Receipts Library
New → Document library → name: `Receipts`

---

## GitHub Setup

### Option A: GitHub Desktop (recommended, no terminal needed)
1. Download https://desktop.github.com and sign in
2. File → Add Local Repository → select this `expense-app` folder
3. If prompted "not a git repo" → Create a repository here
4. Name: `expense-app`, keep Private ticked
5. Click **Publish Repository**

### Option B: Terminal
```bash
cd path/to/expense-app
git init
git add .
git commit -m "Initial commit"
# Create repo on github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/expense-app.git
git branch -M main
git push -u origin main
```

---

## Vercel Deployment

1. https://vercel.com → Add New Project → Import from GitHub
2. Select `expense-app` repo → Import
3. Framework: **Next.js** (auto-detected)
4. Before deploying, go to **Environment Variables** and add all vars from `.env.local`
5. Click **Deploy**
6. Copy your `*.vercel.app` URL
7. Go back to Azure Portal → App registration → Authentication → Add redirect URI:
   `https://your-app.vercel.app` (Single-page application type)

---

## Local Development

```bash
npm install
# create .env.local with your values
npm run dev
# open http://localhost:3000
```

Add `http://localhost:3000` as a redirect URI in Azure App Registration → Authentication.
