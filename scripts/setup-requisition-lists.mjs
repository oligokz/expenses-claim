/**
 * One-shot setup for the Purchase Requisition module's SharePoint lists.
 *
 *   node scripts/setup-requisition-lists.mjs --dry         # print the column plan
 *   node scripts/setup-requisition-lists.mjs --delegated   # sign in as yourself
 *   node scripts/setup-requisition-lists.mjs               # app-only, needs a secret
 *
 * Safe to re-run: it creates what's missing and leaves existing columns alone.
 *
 * TWO AUTH PATHS
 *
 * --delegated (recommended here): device-code sign-in as a real person. Prints a
 * code, you open a browser and approve, and the script then acts with YOUR
 * SharePoint permissions. Needs no client secret — which matters because this
 * project's Vercel env vars are marked Sensitive and are therefore write-only:
 * `vercel env pull` returns the literal placeholder [SENSITIVE], and the real
 * secret cannot be retrieved by anyone. Add --site <url> if SP_SITE_URL isn't
 * readable either; with no --site it lists the sites you can see and stops.
 *
 * default (app-only): client-credentials using AZURE_CLIENT_SECRET from .env.
 * Also requires the app registration to hold Sites.Manage.All or
 * Sites.FullControl.All — Sites.ReadWrite.All can write *items* but cannot
 * create a *list*.
 *
 * If both paths are blocked, --dry prints the full column table to build the
 * two lists by hand in the SharePoint UI.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARGV = process.argv.slice(2);
const DRY = ARGV.includes('--dry');
const DELEGATED = ARGV.includes('--delegated');

const argValue = (flag) => {
  const i = ARGV.indexOf(flag);
  return i !== -1 && ARGV[i + 1] && !ARGV[i + 1].startsWith('--') ? ARGV[i + 1] : null;
};

/* Public tenant id — same value the SPA ships in src/lib/constants.ts, so this
 * is not a secret. Override with --tenant if it ever changes. */
const DEFAULT_TENANT = '7b788342-e05a-443d-a6eb-43624b103a65';

/* Microsoft's own first-party public client ("Microsoft Graph Command Line
 * Tools"). It's the client the Graph PowerShell SDK signs in with, it supports
 * device code, and it needs no registration of our own. */
const DEVICE_CODE_CLIENT = '14d82eec-204b-4c2f-b7e8-296a70dab67e';

/* ── env ── */
function loadEnv() {
  let raw;
  try {
    raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
  } catch {
    // --dry still works without credentials: it just prints the column plan.
    if (DRY) return;
    console.error('No .env found. Run:  npx vercel link;  npx vercel env pull .env');
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

// Vercel's "Sensitive" env vars are write-only: `vercel env pull` writes the
// literal placeholder [SENSITIVE] rather than the value, and no one can read
// the real value back. Treat that placeholder as absent everywhere.
const readable = (k) => {
  const v = process.env[k];
  return v && v !== '[SENSITIVE]' ? v : null;
};

const TENANT = argValue('--tenant') || readable('AZURE_TENANT_ID') || DEFAULT_TENANT;
const SITE_URL = argValue('--site') || readable('SP_SITE_URL');

if (!DRY && !DELEGATED) {
  const need = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'].filter((k) => !readable(k));
  if (need.length) {
    console.error(
      `App-only auth needs real values for: ${need.join(', ')}\n\n` +
      (process.env.AZURE_CLIENT_SECRET === '[SENSITIVE]'
        ? 'Those came back from Vercel as the placeholder [SENSITIVE]. Vercel marks\n' +
          'them Sensitive, which makes them write-only — nobody can pull the real\n' +
          'value back, so this path is closed unless you mint a new client secret.\n\n'
        : '') +
      'Use the delegated path instead — it needs no secret:\n' +
      '  node scripts/setup-requisition-lists.mjs --delegated'
    );
    process.exit(1);
  }
  if (!SITE_URL) {
    console.error('No SP_SITE_URL. Pass it explicitly:  --site https://<tenant>.sharepoint.com/sites/<name>');
    process.exit(1);
  }
}

const REQ_LIST = process.env.SP_REQUISITION_LIST_NAME   || 'Purchase Requisitions';
const CAT_LIST = process.env.SP_REQCATEGORIES_LIST_NAME || 'Requisition Categories';
const APR_LIST = process.env.SP_REQAPPROVERS_LIST_NAME  || 'Requisition Approvers';

/* ── column definitions ── */
const text      = ()      => ({ text: {} });
const multiline = ()      => ({ text: { allowMultipleLines: true, textType: 'plain' } });
const number    = (d = 2) => ({ number: { decimalPlaces: d === 0 ? 'none' : 'two' } });
const dateOnly  = ()      => ({ dateTime: { format: 'dateOnly' } });
const yesNo     = ()      => ({ boolean: {} });
const choice    = (...c)  => ({ choice: { choices: c, displayAs: 'dropDownMenu' } });

const APPROVAL_STATES = ['Pending', 'Approved', 'Rejected'];

const REQ_COLUMNS = [
  // Requestor — identity comes from the verified token, never the client.
  { name: 'RequestorName',     ...text() },
  { name: 'RequestorEmail',    ...text() },
  { name: 'Department',        ...text() },
  { name: 'JobTitle',          ...text() },
  { name: 'SubmissionDate',    ...dateOnly() },

  // Item / service
  { name: 'ItemCategory',      ...text() },
  { name: 'ItemCategoryOther', ...text() },
  { name: 'Description',       ...multiline() },
  { name: 'Quantity',          ...number(0) },
  { name: 'UnitPrice',         ...number() },
  { name: 'Currency',          ...text() },
  { name: 'EstimatedTotal',    ...number() },
  { name: 'EstimatedTotalSGD', ...number() },
  { name: 'ExchangeRates',     ...multiline() },

  // Vendor
  { name: 'VendorName',        ...text() },
  { name: 'VendorContact',     ...text() },
  { name: 'VendorEmail',       ...text() },
  { name: 'QuotationAttached', ...yesNo() },

  // Project
  { name: 'ProjectCustomer',   ...multiline() },

  // Approval — written empty by the API. Whoever runs the approval (a person
  // editing this list, a Power Automate flow, or a future in-app view) fills
  // these in. Shaped now so none of those needs a data migration later.
  { name: 'Status',                 ...choice(...APPROVAL_STATES) },
  { name: 'ApprovalStage',          ...choice('Reporting Manager', 'Final Approval', 'Complete') },
  { name: 'ReportingManager',       ...text() },
  { name: 'ReportingManagerStatus', ...choice(...APPROVAL_STATES) },
  { name: 'ReportingManagerDate',   ...dateOnly() },
  { name: 'FinalApprover',          ...text() },
  { name: 'FinalApprovalStatus',    ...choice(...APPROVAL_STATES) },
  { name: 'FinalApprovalDate',      ...dateOnly() },
  { name: 'ApprovalNotes',          ...multiline() },

  // Approval mechanics. The token id is the nonce from the emailed link: it is
  // matched on use and then cleared, which is what makes a link single-use and
  // stops a decision being replayed. Signatures are stored as file paths, not
  // base64 in a column — a PNG would risk SharePoint's ~64k text limit.
  { name: 'Stage1TokenId',       ...text() },
  { name: 'Stage2TokenId',       ...text() },
  { name: 'Stage1SignatureUrl',  ...text() },
  { name: 'Stage2SignatureUrl',  ...text() },
  { name: 'Stage1SignedName',    ...text() },   // verified identity at signing
  { name: 'Stage2SignedName',    ...text() },
  { name: 'ApprovedPdfUrl',      ...text() },
];

// Mirrors the "Leave Types" list shape: Title is the category name.
// NOT 'Order' — SharePoint reserves that as a built-in hidden field, so creating
// it returns 409 nameAlreadyExists and the value never round-trips.
const CAT_COLUMNS = [
  { name: 'Active',    ...yesNo() },
  { name: 'SortOrder', ...number(0) },
];

/* Who may approve a requisition. A bounded list rather than a directory picker:
 * letting any employee nominate any colleague as the approver of their own
 * spend is a control weakness, not just a UX choice. Title holds the display
 * name; column names avoid anything SharePoint might reserve. */
const APR_COLUMNS = [
  { name: 'ApproverEmail', ...text() },
  { name: 'ApprovalStage', ...choice('Reporting Manager', 'Final Approval', 'Both') },
  { name: 'Department',    ...text() },   // blank = approves for every department
  { name: 'Active',        ...yesNo() },
  { name: 'SortOrder',     ...number(0) },
];

/* Seeded for testing only — real approvers get added in SharePoint. */
const SEED_APPROVERS = [
  { name: 'Bernard Lim', email: 'bernard.lim@creoxtech.com', stage: 'Both' },
];

const SEED_CATEGORIES = [
  'Processors/Compute Units',
  'Memory & Storage',
  'Networking Equipment',
  'Server & Rack Hardware',
  'Peripherals & Accessories',
  'Cables & Components',
  'Software Licenses',
  'Tools & Test Equipment',
  'Office Supplies',
  'Services & Subcontracting',
  'Others',
];

/* ── auth ── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getAppToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: readable('AZURE_CLIENT_ID'),
        client_secret: readable('AZURE_CLIENT_SECRET'),
        scope: 'https://graph.microsoft.com/.default',
      }).toString(),
    }
  );
  if (!res.ok) throw new Error(`Token failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

/**
 * Device-code sign-in. Prints a URL + code, then polls until the browser side
 * completes. Acts as the signed-in person, so no client secret is involved.
 */
async function getDelegatedToken() {
  const scope = 'https://graph.microsoft.com/Sites.Manage.All offline_access openid profile';

  const startRes = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: DEVICE_CODE_CLIENT, scope }).toString(),
    }
  );
  if (!startRes.ok)
    throw new Error(`Device code request failed (${startRes.status}): ${await startRes.text()}`);
  const flow = await startRes.json();

  console.log('\n──────────────────────────────────────────────────');
  console.log(`  Open:  ${flow.verification_uri}`);
  console.log(`  Code:  ${flow.user_code}`);
  console.log('──────────────────────────────────────────────────');
  console.log('  Sign in with your work account, then wait here.\n');

  const deadline = Date.now() + (flow.expires_in || 900) * 1000;
  let interval = (flow.interval || 5) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    const res = await fetch(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: DEVICE_CODE_CLIENT,
          device_code: flow.device_code,
        }).toString(),
      }
    );
    const data = await res.json();
    if (res.ok && data.access_token) {
      console.log('  ✓ signed in\n');
      return data.access_token;
    }
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') { interval += 5000; continue; }
    if (data.error === 'authorization_declined') throw new Error('Sign-in was declined.');
    if (data.error === 'expired_token') break;
    throw new Error(`${data.error}: ${data.error_description || 'sign-in failed'}`);
  }
  throw new Error('Sign-in timed out — re-run and complete the browser step sooner.');
}

const getToken = () => (DELEGATED ? getDelegatedToken() : getAppToken());

/**
 * List the sites the signed-in identity can see, with each site's user-visible
 * lists. SP_SITE_URL is sealed as [SENSITIVE], so the way to find the site the
 * app already writes to is to look for the lists it already writes to.
 */
async function listSites(token) {
  const data = await graph(token, '/sites?search=*&$select=id,displayName,webUrl&$top=100');
  const sites = (data.value || []).filter((s) => s.webUrl);
  if (!sites.length) {
    console.log('No sites visible to this account.');
    return;
  }

  // Lists the app already uses, so we can spot the site it's wired to.
  const KNOWN = [
    'expense', 'claim', 'leave', 'requisition', 'purchase', 'attachment',
  ];

  console.log(`Sites you can see (${sites.length}):\n`);
  for (const s of sites) {
    console.log(`  ${s.displayName || '(no name)'}`);
    console.log(`    ${s.webUrl}`);
    try {
      const ld = await graph(
        token,
        `/sites/${s.id}/lists?$select=displayName,list&$top=100`
      );
      const lists = (ld.value || []).filter((l) => l.list && !l.list.hidden);
      if (!lists.length) {
        console.log('      (no visible lists)');
      } else {
        for (const l of lists) {
          const hit = KNOWN.some((k) => (l.displayName || '').toLowerCase().includes(k));
          console.log(`      ${hit ? '*' : '-'} ${l.displayName}`);
        }
      }
    } catch (e) {
      console.log(`      (couldn't read lists: ${e.status || '?'})`);
    }
    console.log('');
  }
  console.log('* = name suggests this app already uses it\n');
  console.log('Re-run against the right site:');
  console.log('  node scripts/setup-requisition-lists.mjs --delegated --site <webUrl>');
}

async function graph(token, path, init = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return body ? JSON.parse(body) : null;
}

async function findList(token, siteId, displayName) {
  const data = await graph(token, `/sites/${siteId}/lists?$select=id,displayName&$top=200`);
  return (data.value || []).find((l) => l.displayName === displayName) || null;
}

/** Create the list if absent; otherwise add only the columns it's missing. */
async function ensureList(token, siteId, displayName, columns) {
  const existing = await findList(token, siteId, displayName);

  if (!existing) {
    console.log(`  creating list "${displayName}" with ${columns.length} columns`);
    if (DRY) return null;
    const created = await graph(token, `/sites/${siteId}/lists`, {
      method: 'POST',
      body: JSON.stringify({ displayName, columns, list: { template: 'genericList' } }),
    });
    console.log(`  ✓ created (id ${created.id})`);
    return created.id;
  }

  console.log(`  list "${displayName}" already exists — checking columns`);
  const have = new Set(
    ((await graph(token, `/sites/${siteId}/lists/${existing.id}/columns?$select=name`)).value || [])
      .map((c) => c.name)
  );
  const absent = columns.filter((c) => !have.has(c.name));
  if (!absent.length) {
    console.log('  ✓ all columns present');
    return existing.id;
  }
  console.log(`  adding ${absent.length} missing column(s): ${absent.map((c) => c.name).join(', ')}`);
  if (DRY) return existing.id;
  for (const col of absent) {
    try {
      await graph(token, `/sites/${siteId}/lists/${existing.id}/columns`, {
        method: 'POST',
        body: JSON.stringify(col),
      });
      console.log(`    ✓ ${col.name}`);
    } catch (e) {
      // A name that collides with a built-in hidden field (SharePoint reserves
      // e.g. 'Order') 409s even though it never showed up in the column list.
      // Report it and keep going — aborting here would skip later steps.
      if (e.status === 409) {
        console.log(`    ! ${col.name}: name reserved by SharePoint — rename it`);
      } else {
        console.log(`    ! ${col.name}: ${e.message.slice(0, 160)}`);
      }
    }
  }
  return existing.id;
}

const sortValue = (name) => (SEED_CATEGORIES.indexOf(name) + 1) * 10;

/**
 * Seed category rows, skipping any Title already present, and backfill
 * SortOrder on rows created before that column existed.
 */
async function seedCategories(token, siteId, listId) {
  const data     = await graph(token, `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`);
  const existing = (data.value || []).filter((i) => i.fields?.Title);
  const have     = new Set(existing.map((i) => i.fields.Title));
  const absent   = SEED_CATEGORIES.filter((c) => !have.has(c));

  if (absent.length) {
    console.log(`  seeding ${absent.length} categor${absent.length === 1 ? 'y' : 'ies'}`);
    if (!DRY) {
      for (const name of absent) {
        await graph(token, `/sites/${siteId}/lists/${listId}/items`, {
          method: 'POST',
          body: JSON.stringify({
            fields: { Title: name, Active: true, SortOrder: sortValue(name) },
          }),
        });
        console.log(`    ✓ ${name}`);
      }
    }
  } else {
    console.log('  ✓ all categories present');
  }

  // Rows seeded before SortOrder existed carry no sort value.
  const unsorted = existing.filter(
    (i) => i.fields.SortOrder === undefined || i.fields.SortOrder === null
  );
  if (!unsorted.length) return;

  console.log(`  backfilling SortOrder on ${unsorted.length} row(s)`);
  if (DRY) return;
  for (const item of unsorted) {
    const value = sortValue(item.fields.Title);
    try {
      await graph(token, `/sites/${siteId}/lists/${listId}/items/${item.id}/fields`, {
        method: 'PATCH',
        body: JSON.stringify({ SortOrder: value > 0 ? value : 999 }),
      });
      console.log(`    ✓ ${item.fields.Title}`);
    } catch (e) {
      console.log(`    ! ${item.fields.Title}: ${e.message.slice(0, 120)}`);
    }
  }
}

/** Seed approver rows, skipping any email already present. */
async function seedApprovers(token, siteId, listId) {
  const data = await graph(token, `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`);
  const have = new Set(
    (data.value || []).map((i) => (i.fields?.ApproverEmail || '').toLowerCase()).filter(Boolean)
  );
  const absent = SEED_APPROVERS.filter((a) => !have.has(a.email.toLowerCase()));
  if (!absent.length) {
    console.log('  ✓ approvers already seeded');
    return;
  }
  console.log(`  seeding ${absent.length} approver(s)`);
  if (DRY) return;
  for (let i = 0; i < absent.length; i++) {
    const a = absent[i];
    await graph(token, `/sites/${siteId}/lists/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title:         a.name,
          ApproverEmail: a.email,
          ApprovalStage: a.stage,
          Department:    '',
          Active:        true,
          SortOrder:     (i + 1) * 10,
        },
      }),
    });
    console.log(`    ✓ ${a.name} <${a.email}> — ${a.stage}`);
  }
}

/* ── column indexing ──
 * my-requests.js filters each list server-side on the requester's email using
 * the `HonorNonIndexedQueriesWarningMayFailRandomly` header. That header does
 * what it says once a list passes SharePoint's 5,000-item view threshold, so
 * the email column each query filters on should be indexed before then.
 */
const INDEX_TARGETS = [
  // SP_LIST_NAME is sealed as [SENSITIVE]; 'ExpenseClaims' is the name observed
  // on the Forms site. Override with the env var if it differs.
  { list: readable('SP_LIST_NAME') || 'ExpenseClaims', column: 'EmployeeEmail' },
  { list: process.env.SP_LEAVE_LIST_NAME || 'Leave Requests', column: 'EmployeeEmail' },
  { list: REQ_LIST, column: 'RequestorEmail' },
];

async function indexColumns(token, siteId) {
  for (const target of INDEX_TARGETS) {
    console.log(`  ${target.list} → ${target.column}`);
    const list = await findList(token, siteId, target.list);
    if (!list) {
      console.log('    ! list not found — skipped');
      continue;
    }
    const cols = await graph(
      token,
      `/sites/${siteId}/lists/${list.id}/columns?$select=id,name,indexed`
    );
    const col = (cols.value || []).find((c) => c.name === target.column);
    if (!col) {
      console.log('    ! column not found — skipped');
      continue;
    }
    if (col.indexed) {
      console.log('    ✓ already indexed');
      continue;
    }
    if (DRY) {
      console.log('    would index');
      continue;
    }
    try {
      await graph(token, `/sites/${siteId}/lists/${list.id}/columns/${col.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ indexed: true }),
      });
      console.log('    ✓ indexed');
    } catch (e) {
      console.log(`    ! failed: ${e.message.slice(0, 160)}`);
    }
  }
}

/* ── main ── */
async function main() {
  if (DRY && !SITE_URL) {
    console.log('DRY RUN (no credentials) — column plan only:\n');
    console.log(`${REQ_LIST}:`);
    for (const c of REQ_COLUMNS) console.log(`  ${c.name.padEnd(24)} ${describe(c)}`);
    console.log(`\n${CAT_LIST}:`);
    console.log(`  ${'Title'.padEnd(24)} text (built-in — the category name)`);
    for (const c of CAT_COLUMNS) console.log(`  ${c.name.padEnd(24)} ${describe(c)}`);
    console.log(`\nSeed rows: ${SEED_CATEGORIES.join(', ')}`);
    return;
  }

  console.log(
    `Auth: ${DELEGATED ? 'delegated (sign-in as you)' : 'app-only'}${DRY ? '  ·  DRY RUN' : ''}`
  );
  const token = await getToken();

  // Without a site URL there's nothing to target — show what's reachable and stop.
  if (!SITE_URL) {
    await listSites(token);
    return;
  }

  const url  = new URL(SITE_URL);
  const site = await graph(token, `/sites/${url.hostname}:${url.pathname}`);
  console.log(`Site: ${site.displayName || site.name}  (${SITE_URL})\n`);

  console.log(`[1/4] ${REQ_LIST}`);
  await ensureList(token, site.id, REQ_LIST, REQ_COLUMNS);

  console.log(`\n[2/4] ${CAT_LIST}`);
  const catId = await ensureList(token, site.id, CAT_LIST, CAT_COLUMNS);
  if (catId) await seedCategories(token, site.id, catId);

  console.log(`\n[3/4] ${APR_LIST}`);
  const aprId = await ensureList(token, site.id, APR_LIST, APR_COLUMNS);
  if (aprId) await seedApprovers(token, site.id, aprId);

  console.log('\n[4/4] Indexing the email columns my-requests.js filters on');
  await indexColumns(token, site.id);

  console.log('\nDone.');
  if (!DRY) {
    console.log('\nIf you used non-default list names, set these in Vercel:');
    console.log(`  SP_REQUISITION_LIST_NAME=${REQ_LIST}`);
    console.log(`  SP_REQCATEGORIES_LIST_NAME=${CAT_LIST}`);
  }
}

function describe(c) {
  if (c.choice)  return `choice (${c.choice.choices.join(' / ')})`;
  if (c.number)  return 'number';
  if (c.boolean) return 'yes/no';
  if (c.dateTime) return 'date only';
  if (c.text?.allowMultipleLines) return 'multiple lines of text';
  return 'single line of text';
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  if (err.status === 403) {
    console.error(
      '\n403 — the app registration lacks Sites.Manage.All / Sites.FullControl.All.\n' +
      'Either get that granted, or run with --dry and build the lists by hand.'
    );
  }
  process.exit(1);
});
