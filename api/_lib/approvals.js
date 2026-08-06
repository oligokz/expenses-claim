// Approval mechanics, shared across modules.
//
// Only 'requisition' is registered today. Leave and expense can join by adding
// a MODULES entry plus the matching SharePoint columns — the token scheme, the
// sign-in gate, the state machine and the signature handling are all generic.
// Stage count is per-module config because leave almost certainly wants one
// stage where a purchase wants two.

const crypto = require('node:crypto');

/* ── module registry ── */

const MODULES = {
  requisition: {
    refPrefix: 'REQ',
    listName: () => process.env.SP_REQUISITION_LIST_NAME || 'Purchase Requisitions',
    stages: [
      {
        n: 1,
        label: 'Reporting Manager',
        nextStage: 'Final Approval',
        approverField: 'ReportingManager',
        statusField: 'ReportingManagerStatus',
        dateField: 'ReportingManagerDate',
        tokenField: 'Stage1TokenId',
        signatureField: 'Stage1SignatureUrl',
        signedNameField: 'Stage1SignedName',
      },
      {
        n: 2,
        label: 'Final Approval',
        nextStage: 'Complete',
        approverField: 'FinalApprover',
        statusField: 'FinalApprovalStatus',
        dateField: 'FinalApprovalDate',
        tokenField: 'Stage2TokenId',
        signatureField: 'Stage2SignatureUrl',
        signedNameField: 'Stage2SignedName',
      },
    ],
    /** Shape the row into what the approval page renders. */
    summarise: (f) => ({
      title: f.ItemCategoryOther || f.ItemCategory || '',
      description: f.Description || '',
      requester: f.RequestorName || '',
      requesterEmail: f.RequestorEmail || '',
      department: f.Department || '',
      submittedOn: f.SubmissionDate || '',
      rows: [
        ['Quantity', String(f.Quantity ?? '')],
        ['Unit price', `${f.Currency || 'SGD'} ${Number(f.UnitPrice || 0).toFixed(2)}`],
        ['Estimated total', `SGD ${Number(f.EstimatedTotalSGD || 0).toFixed(2)}`],
        ['Vendor', f.VendorName || ''],
        ['Vendor contact', f.VendorContact || ''],
        ['Project / customer', f.ProjectCustomer || ''],
      ].filter(([, v]) => v && v.trim() !== '' && !/^SGD 0\.00$/.test(v)),
    }),
  },
};

const getModule = (name) => MODULES[name] || null;
const stageOf = (mod, n) => mod.stages.find((s) => s.n === Number(n)) || null;

/* ── token signing ──
 * HS256 over a key derived from the app's client secret rather than a new env
 * var, so this needs no extra Vercel configuration. The trade: rotating
 * AZURE_CLIENT_SECRET invalidates outstanding approval links, which is a
 * comprehensible failure (approvers just need a fresh link) and rotation is
 * rare. Set APPROVAL_TOKEN_SECRET to decouple them.
 */
function signingKey() {
  const explicit = process.env.APPROVAL_TOKEN_SECRET;
  if (explicit) return new TextEncoder().encode(explicit);

  const base = process.env.AZURE_CLIENT_SECRET;
  if (!base) throw new Error('No APPROVAL_TOKEN_SECRET or AZURE_CLIENT_SECRET to sign approval links with');
  // Distinct label so this key can never collide with the secret's other use.
  return crypto.createHash('sha256').update(`approval-link-v1:${base}`).digest();
}

const TOKEN_TTL_DAYS = 14;

/** Mint a single-use approval link token. Returns { token, jti }. */
async function mintToken({ module: moduleName, itemId, stage, approver }) {
  const { SignJWT } = await import('jose');
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ module: moduleName, itemId: String(itemId), stage, approver })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_DAYS}d`)
    .sign(signingKey());
  return { token, jti };
}

function badToken(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

/** Verify a token's signature and shape. Does NOT check single-use — see consume(). */
async function readToken(token) {
  if (!token) throw badToken('Missing approval token');
  const { jwtVerify } = await import('jose');
  let payload;
  try {
    ({ payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'] }));
  } catch (err) {
    throw badToken(
      /exp/i.test(err.message)
        ? 'This approval link has expired. Ask for a fresh one.'
        : 'This approval link is not valid.'
    );
  }
  const mod = getModule(payload.module);
  if (!mod) throw badToken('Unknown approval type');
  const stage = stageOf(mod, payload.stage);
  if (!stage) throw badToken('Unknown approval stage');
  return { mod, stage, itemId: payload.itemId, approver: payload.approver, jti: payload.jti };
}

/* ── SharePoint row access ── */

async function getRow(token, siteId, mod, itemId) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(mod.listName())}/items/${encodeURIComponent(itemId)}?$expand=fields`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const e = new Error(`Could not load that request (${res.status})`);
    e.status = res.status === 404 ? 404 : 500;
    throw e;
  }
  return (await res.json()).fields || {};
}

async function patchRow(token, siteId, mod, itemId, fields) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(mod.listName())}/items/${encodeURIComponent(itemId)}/fields`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }
  );
  if (!res.ok) throw new Error(`Could not record the decision (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Check a token is still the live one for its stage, and that the row is
 * actually waiting at that stage. Guards replay and out-of-order approval.
 */
function assertActionable(fields, stage, jti) {
  const already = fields[stage.statusField];
  if (already && already !== 'Pending') {
    throw badToken(`This request was already ${String(already).toLowerCase()} at this stage.`);
  }
  if (fields.Status && fields.Status !== 'Pending') {
    throw badToken(`This request is already ${String(fields.Status).toLowerCase()}.`);
  }
  const stored = fields[stage.tokenField];
  // A cleared or replaced nonce means the link has been spent or superseded.
  if (!stored || stored !== jti) {
    throw badToken('This approval link has already been used, or a newer one was issued.');
  }
}

/** Does the signed-in person match the approver this stage is addressed to? */
function isExpectedApprover(fields, stage, email) {
  const expected = (fields[stage.approverField] || '').trim().toLowerCase();
  if (!expected) return false;
  return expected === (email || '').trim().toLowerCase();
}

module.exports = {
  MODULES,
  getModule,
  stageOf,
  mintToken,
  readToken,
  getRow,
  patchRow,
  assertActionable,
  isExpectedApprover,
  TOKEN_TTL_DAYS,
};
