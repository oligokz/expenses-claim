/**
 * One-shot setup for the Purchase Requisition module's SharePoint lists.
 *
 *   node scripts/setup-requisition-lists.mjs          # create / repair
 *   node scripts/setup-requisition-lists.mjs --dry    # show what it would do
 *
 * Reads credentials from .env (run `npx vercel env pull .env` first).
 * Safe to re-run: it creates what's missing and leaves existing columns alone.
 *
 * NOTE ON PERMISSIONS: creating a list needs the app registration to hold
 * Sites.Manage.All or Sites.FullControl.All. Sites.ReadWrite.All is enough to
 * write *items* but NOT to create a *list* — if this fails with 403, either get
 * that permission granted, or build the two lists by hand from the column table
 * printed by --dry.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

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

const REQUIRED = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'SP_SITE_URL'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length && !DRY) {
  console.error(`Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const REQ_LIST = process.env.SP_REQUISITION_LIST_NAME   || 'Purchase Requisitions';
const CAT_LIST = process.env.SP_REQCATEGORIES_LIST_NAME || 'Requisition Categories';

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
];

// Mirrors the "Leave Types" list shape: Title is the category name.
const CAT_COLUMNS = [
  { name: 'Active', ...yesNo() },
  { name: 'Order',  ...number(0) },
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

/* ── graph ── */
async function getToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }).toString(),
    }
  );
  if (!res.ok) throw new Error(`Token failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
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
    await graph(token, `/sites/${siteId}/lists/${existing.id}/columns`, {
      method: 'POST',
      body: JSON.stringify(col),
    });
    console.log(`    ✓ ${col.name}`);
  }
  return existing.id;
}

/** Seed category rows, skipping any Title that's already there. */
async function seedCategories(token, siteId, listId) {
  const data  = await graph(token, `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`);
  const have  = new Set((data.value || []).map((i) => i.fields?.Title).filter(Boolean));
  const absent = SEED_CATEGORIES.filter((c) => !have.has(c));
  if (!absent.length) {
    console.log('  ✓ categories already seeded');
    return;
  }
  console.log(`  seeding ${absent.length} categor${absent.length === 1 ? 'y' : 'ies'}`);
  if (DRY) return;
  for (let i = 0; i < absent.length; i++) {
    await graph(token, `/sites/${siteId}/lists/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: absent[i],
          Active: true,
          Order: (SEED_CATEGORIES.indexOf(absent[i]) + 1) * 10,
        },
      }),
    });
    console.log(`    ✓ ${absent[i]}`);
  }
}

/* ── main ── */
async function main() {
  if (DRY && missing.length) {
    console.log('DRY RUN (no credentials) — column plan only:\n');
    console.log(`${REQ_LIST}:`);
    for (const c of REQ_COLUMNS) console.log(`  ${c.name.padEnd(24)} ${describe(c)}`);
    console.log(`\n${CAT_LIST}:`);
    console.log(`  ${'Title'.padEnd(24)} text (built-in — the category name)`);
    for (const c of CAT_COLUMNS) console.log(`  ${c.name.padEnd(24)} ${describe(c)}`);
    console.log(`\nSeed rows: ${SEED_CATEGORIES.join(', ')}`);
    return;
  }

  console.log(`Site: ${process.env.SP_SITE_URL}${DRY ? '  (DRY RUN)' : ''}\n`);
  const token = await getToken();

  const url  = new URL(process.env.SP_SITE_URL);
  const site = await graph(token, `/sites/${url.hostname}:${url.pathname}`);
  console.log(`Resolved site: ${site.displayName || site.name}\n`);

  console.log(`[1/2] ${REQ_LIST}`);
  await ensureList(token, site.id, REQ_LIST, REQ_COLUMNS);

  console.log(`\n[2/2] ${CAT_LIST}`);
  const catId = await ensureList(token, site.id, CAT_LIST, CAT_COLUMNS);
  if (catId) await seedCategories(token, site.id, catId);

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
