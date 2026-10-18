/**
 * SharePoint admin for the forms site, signed in as a real person.
 *
 *   node scripts/sp.mjs sites                       # find the site the app uses
 *   node scripts/sp.mjs audit  --site <url>         # every list vs what the app writes
 *   node scripts/sp.mjs items  --site <url> --list "Purchase Requisitions" [--top 5] [--id 19]
 *   node scripts/sp.mjs graph  GET /sites/{site}/lists          # any Graph call
 *   node scripts/sp.mjs graph  PATCH <path> --body file.json --yes
 *
 * Sign-in is Microsoft's device-code flow with its own Graph command-line
 * client (see setup-requisition-lists.mjs): it prints a code, you approve it in
 * a browser, and the script acts with YOUR permissions. No client secret.
 *
 * Anything other than GET refuses to run without --yes, so a read can never
 * change the site by accident.
 *
 * Set SP_TOKEN_CACHE to a file path to keep the sign-in between runs. It holds
 * a refresh token for your account: keep it out of the repo and delete it when
 * done. Unset, every run signs in afresh.
 *
 * In Git Bash, set MSYS_NO_PATHCONV=1 first, or it rewrites "/sites/..." into
 * a Windows path before the script sees it.
 *
 * Graph cannot change a column's type (single line to multiple lines, say).
 * That needs the SharePoint REST API, or List settings in the browser.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ARGV = process.argv.slice(2);
const CMD = ARGV[0];
const flag = (name) => ARGV.includes(name);
const arg = (name) => {
  const i = ARGV.indexOf(name);
  return i !== -1 && ARGV[i + 1] && !ARGV[i + 1].startsWith('--') ? ARGV[i + 1] : null;
};

// Public values, same as src/lib/constants.ts and setup-requisition-lists.mjs.
const TENANT = arg('--tenant') || '7b788342-e05a-443d-a6eb-43624b103a65';
const DEVICE_CODE_CLIENT = '14d82eec-204b-4c2f-b7e8-296a70dab67e';
const SCOPE = 'https://graph.microsoft.com/Sites.FullControl.All offline_access openid profile';
const CACHE = process.env.SP_TOKEN_CACHE || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── sign-in ── */

async function tokenRequest(params) {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: DEVICE_CODE_CLIENT, ...params }).toString(),
  });
  return { ok: res.ok, data: await res.json() };
}

function save(data) {
  if (!CACHE) return data.access_token;
  writeFileSync(CACHE, JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 300) * 1000,
  }));
  return data.access_token;
}

async function deviceCode() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: DEVICE_CODE_CLIENT, scope: SCOPE }).toString(),
  });
  if (!res.ok) throw new Error(`Device code request failed (${res.status}): ${await res.text()}`);
  const flow = await res.json();
  console.log(`\nSIGN-IN  open ${flow.verification_uri}  and enter code  ${flow.user_code}\n`);

  const deadline = Date.now() + (flow.expires_in || 900) * 1000;
  let interval = (flow.interval || 5) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const { ok, data } = await tokenRequest({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: flow.device_code,
    });
    if (ok && data.access_token) { console.log('Signed in.\n'); return save(data); }
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') { interval += 5000; continue; }
    throw new Error(`${data.error}: ${data.error_description || 'sign-in failed'}`);
  }
  throw new Error('Sign-in timed out.');
}

async function getToken() {
  if (CACHE && existsSync(CACHE)) {
    const c = JSON.parse(readFileSync(CACHE, 'utf8'));
    if (c.access_token && Date.now() < c.expires_at) return c.access_token;
    if (c.refresh_token) {
      const { ok, data } = await tokenRequest({
        grant_type: 'refresh_token', refresh_token: c.refresh_token, scope: SCOPE,
      });
      if (ok && data.access_token) return save(data);
    }
  }
  return deviceCode();
}

/* ── Graph ── */

async function graph(token, method, path, body, extraHeaders = {}) {
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
    e.status = res.status;
    throw e;
  }
  return text ? JSON.parse(text) : null;
}

async function all(token, path) {
  const out = [];
  let next = path;
  while (next) {
    const page = await graph(token, 'GET', next);
    out.push(...(page.value || []));
    next = page['@odata.nextLink'] || null;
  }
  return out;
}

async function siteId(token) {
  const url = arg('--site');
  if (!url) throw new Error('Pass --site <https://tenant.sharepoint.com/sites/Name>. Run `sites` to find it.');
  const u = new URL(url);
  return (await graph(token, 'GET', `/sites/${u.hostname}:${u.pathname.replace(/\/+$/, '')}`)).id;
}

/* ── what the app expects of each list ──
 * Built from the API code where it can be, so this can't drift from it: the
 * approval columns come from the module registry in api/_lib/approvals.js. */

function expectedLists() {
  const { MODULES } = require('../api/_lib/approvals.js');
  const approvalCols = (mod) => {
    const cols = new Set([mod.notesField, mod.stageField, 'Status'].filter(Boolean));
    for (const s of mod.stages) {
      for (const k of ['approverField', 'statusField', 'dateField', 'tokenField', 'signatureField', 'signedNameField']) {
        if (s[k]) cols.add(s[k]);
      }
    }
    if (mod.pdf) cols.add('ApprovedPdfUrl');
    return [...cols];
  };

  return [
    {
      key: 'expense', name: process.env.SP_LIST_NAME || 'ExpenseClaims',
      cols: ['EmployeeName', 'EmployeeEmail', 'Department', 'SubmissionDate', 'Category',
        'Description', 'ReceiptDate', 'Quantity', 'Currency', 'Amount', 'TotalAmountSGD',
        'Notes', 'ReceiptCount', 'ExchangeRates', ...approvalCols(MODULES.expense)],
      multiline: ['Description', 'Notes', 'ExchangeRates', 'ApproverComments'],
      indexed: ['EmployeeEmail', 'Status'],
    },
    {
      key: 'leave', name: process.env.SP_LEAVE_LIST_NAME || 'Leave Requests',
      cols: ['EmployeeName', 'EmployeeEmail', 'Department', 'LeaveType', 'StartDate', 'EndDate',
        'StartPortion', 'EndPortion', 'Days', 'Reason', ...approvalCols(MODULES.leave)],
      multiline: ['Reason', 'ApproverComments'],
      indexed: ['EmployeeEmail', 'Status'],
    },
    {
      key: 'requisition', name: process.env.SP_REQUISITION_LIST_NAME || 'Purchase Requisitions',
      cols: ['RequestorName', 'RequestorEmail', 'Department', 'JobTitle', 'SubmissionDate',
        'ItemCategory', 'ItemCategoryOther', 'Description', 'Quantity', 'UnitPrice', 'LineItems',
        'Currency', 'EstimatedTotal', 'EstimatedTotalSGD', 'ExchangeRates', 'VendorName',
        'VendorContact', 'VendorEmail', 'QuotationAttached', 'ProjectCustomer',
        ...approvalCols(MODULES.requisition)],
      multiline: ['Description', 'LineItems', 'ExchangeRates', 'ApprovalNotes'],
      indexed: ['RequestorEmail', 'Status'],
      choices: { ApprovalStage: ['Reporting Manager', 'Final Approval', 'Complete'] },
    },
    {
      key: 'travel', name: process.env.SP_TRAVEL_LIST_NAME || 'Travel Requests',
      cols: ['RequestorName', 'RequestorEmail', 'Department', 'JobTitle', 'SubmissionDate',
        'PurposeOfTravel', 'EventName', 'Destination', 'TravelFrom', 'TravelTo', 'Agenda',
        'CostFlight', 'CostHotel', 'CostEventFees', 'CostTransport', 'CostOther', 'CostOtherNote',
        'TotalEstimatedSGD', ...approvalCols(MODULES.travel)],
      multiline: ['Agenda', 'ApprovalNotes'],
      indexed: ['RequestorEmail', 'Status'],
      choices: { ApprovalStage: ['Reporting Manager', 'Finance/HR', 'Final Approval', 'Complete'] },
    },
    {
      key: 'approvers', name: process.env.SP_REQAPPROVERS_LIST_NAME || 'Requisition Approvers',
      cols: ['ApproverEmail', 'ApprovalStage', 'Department', 'Active', 'SortOrder'],
      choices: { ApprovalStage: ['Reporting Manager', 'Final Approval', 'Both'] },
    },
    { key: 'leaveTypes', name: process.env.SP_LEAVETYPES_LIST_NAME || 'Leave Types', cols: ['Active'] },
    { key: 'categories', name: process.env.SP_REQCATEGORIES_LIST_NAME || 'Requisition Categories', cols: ['Active'] },
  ];
}

const typeOf = (c) =>
  c.text ? (c.text.allowMultipleLines ? 'multiline' : 'text')
  : c.number ? 'number' : c.currency ? 'currency' : c.dateTime ? `date(${c.dateTime.format})`
  : c.choice ? 'choice' : c.boolean ? 'yes/no' : c.personOrGroup ? 'person'
  : c.lookup ? 'lookup' : c.calculated ? 'calculated' : c.hyperlinkOrPicture ? 'link' : 'other';

/* ── commands ── */

async function cmdSites(token) {
  const sites = (await graph(token, 'GET', '/sites?search=*&$select=id,displayName,webUrl&$top=200')).value || [];
  for (const s of sites) {
    let names = [];
    try {
      names = (await all(token, `/sites/${s.id}/lists?$select=displayName,list&$top=200`))
        .filter((l) => l.list && !l.list.hidden).map((l) => l.displayName);
    } catch { /* no access */ }
    const hit = names.some((n) => /expense|claim|leave|requisition|travel/i.test(n));
    console.log(`${hit ? '*' : ' '} ${s.displayName}  ${s.webUrl}${hit ? `\n    ${names.join(', ')}` : ''}`);
  }
}

async function cmdAudit(token) {
  const site = await siteId(token);
  const lists = await all(token, `/sites/${site}/lists?$select=id,displayName,list&$expand=columns&$top=200`);
  const byName = new Map(lists.map((l) => [l.displayName, l]));
  let problems = 0;
  const flag_ = (msg) => { problems++; console.log(`    ! ${msg}`); };

  for (const exp of expectedLists()) {
    const list = byName.get(exp.name);
    console.log(`\n${exp.name}  (${exp.key})`);
    if (!list) { flag_('LIST NOT FOUND'); continue; }

    const cols = new Map((list.columns || []).map((c) => [c.name, c]));

    const missing = exp.cols.filter((n) => !cols.has(n));
    if (missing.length) flag_(`missing columns: ${missing.join(', ')}`);
    for (const n of exp.multiline || []) {
      const c = cols.get(n);
      if (c && !(c.text && c.text.allowMultipleLines)) flag_(`${n} is ${typeOf(c)}, needs multiple lines (255-char limit otherwise)`);
    }
    for (const n of exp.indexed || []) {
      const c = cols.get(n);
      if (c && !c.indexed) flag_(`${n} is not indexed (queries fail past ~5,000 rows)`);
    }
    for (const [n, want] of Object.entries(exp.choices || {})) {
      const c = cols.get(n);
      if (c?.choice) {
        const lack = want.filter((v) => !c.choice.choices.includes(v));
        if (lack.length) flag_(`${n} choice is missing: ${lack.join(', ')}`);
      } else if (c && !c.text) {
        flag_(`${n} is ${typeOf(c)}, expected a choice or text column`);
      }
    }
    if (flag('--columns')) {
      for (const c of list.columns || []) {
        if (c.readOnly || c.columnGroup === '_Hidden') continue;
        console.log(`    ${c.name.padEnd(26)} ${typeOf(c).padEnd(16)}${c.indexed ? ' indexed' : ''}${c.required ? ' required' : ''}`);
      }
    }
    if (!missing.length) console.log('    columns ok');
  }

  const known = new Set(expectedLists().map((e) => e.name));
  const others = lists.filter((l) => l.list && !l.list.hidden && !known.has(l.displayName)).map((l) => l.displayName);
  if (others.length) console.log(`\nOther lists/libraries on the site: ${others.join(', ')}`);
  console.log(`\n${problems ? `${problems} problem(s) found.` : 'No problems found.'}`);
}

async function cmdItems(token) {
  const site = await siteId(token);
  const listName = arg('--list');
  if (!listName) throw new Error('Pass --list "<display name>"');
  const base = `/sites/${site}/lists/${encodeURIComponent(listName)}/items`;
  const id = arg('--id');
  const rows = id
    ? [await graph(token, 'GET', `${base}/${id}?$expand=fields`)]
    : (await graph(token, 'GET', `${base}?$expand=fields&$orderby=id desc&$top=${Number(arg('--top')) || 5}`,
        undefined, { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' })).value || [];
  for (const r of rows) {
    const f = { ...r.fields };
    // Approval nonces are live credentials for a pending stage; don't print them.
    for (const k of Object.keys(f)) if (/TokenId$/.test(k) && f[k]) f[k] = '(set)';
    for (const k of Object.keys(f)) if (k.startsWith('@odata') || k.startsWith('_')) delete f[k];
    console.log(JSON.stringify({ id: r.id, created: r.createdDateTime, ...f }, null, 2));
  }
}

async function cmdGraph(token) {
  const method = (ARGV[1] || 'GET').toUpperCase();
  const path = ARGV[2];
  if (!path) throw new Error('Usage: graph <METHOD> <path> [--body file.json] [--yes]');
  if (method !== 'GET' && !flag('--yes')) throw new Error(`${method} changes the site. Re-run with --yes to confirm.`);
  const bodyFile = arg('--body');
  const body = bodyFile ? JSON.parse(readFileSync(bodyFile, 'utf8')) : undefined;
  const site = arg('--site') ? await siteId(token) : null;
  const out = await graph(token, method, site ? path.replace('{site}', site) : path, body);
  console.log(JSON.stringify(out, null, 2));
}

const COMMANDS = { sites: cmdSites, audit: cmdAudit, items: cmdItems, graph: cmdGraph };

(async () => {
  const run = COMMANDS[CMD];
  if (!run) {
    console.log('Commands: sites | audit --site <url> [--columns] | items --site <url> --list <name> [--id n] | graph <METHOD> <path> [--site <url>] [--body f] [--yes]');
    process.exit(1);
  }
  await run(await getToken());
})().catch((e) => { console.error(e.message); process.exit(1); });
