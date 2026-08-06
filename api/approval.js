const {
  getAppToken, getSiteId, getDriveId, verifyUserToken, applyCors,
} = require('./_lib/sharepoint');
const {
  readToken, mintToken, getRow, patchRow,
  assertActionable, isExpectedApprover, stageOf, TOKEN_TTL_DAYS,
} = require('./_lib/approvals');
const { sendMail, templates } = require('./_lib/mail');

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Approvers for a stage, from the admin-managed list. */
async function approversFor(token, siteId, stageLabel) {
  const listName = process.env.SP_REQAPPROVERS_LIST_NAME || 'Requisition Approvers';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?$expand=fields&$top=200`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  return ((await res.json()).value || [])
    .map((i) => i.fields || {})
    .filter((f) => f.Active !== false && f.ApproverEmail)
    .filter((f) => f.ApprovalStage === stageLabel || f.ApprovalStage === 'Both')
    .sort((a, b) => (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0))
    .map((f) => ({ name: f.Title || f.ApproverEmail, email: f.ApproverEmail }));
}

/** Store a signature PNG beside the request's other attachments. */
async function saveSignature(token, siteId, dataUrl, claimRef, stageN) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Signature must be a PNG data URL');
  const buffer = Buffer.from(m[1], 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw new Error('Signature image too large');

  const driveId = await getDriveId(token, siteId);
  const month = todayIso().slice(0, 7);
  const path = ['Requisition Attachments', month, claimRef, 'signatures', `stage${stageN}.png`]
    .map(encodeURIComponent)
    .join('/');

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${path}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body: buffer,
    }
  );
  if (!res.ok) throw new Error(`Signature upload failed (${res.status})`);
  const saved = await res.json();
  return saved.webUrl || path;
}

/* ── GET: what the approver is being asked to sign ── */
async function handleGet(req, res) {
  const { mod, stage, itemId, approver } = await readToken(req.query.t);
  const user = await verifyUserToken(req);

  const token  = await getAppToken();
  const siteId = await getSiteId(token);
  const fields = await getRow(token, siteId, mod, itemId);
  const claimRef = `${mod.refPrefix}-${itemId}`;

  // Identity, not the link, decides who may act.
  const permitted =
    isExpectedApprover(fields, stage, user.email) ||
    (approver || '').toLowerCase() === (user.email || '').toLowerCase();

  if (!permitted) {
    return res.status(403).json({
      error: `This approval is addressed to someone else. You are signed in as ${user.email}.`,
    });
  }

  // Surface a spent or superseded link as a readable state, not an error page.
  let actionable = true;
  let reason = '';
  try {
    assertActionable(fields, stage, (await readToken(req.query.t)).jti);
  } catch (e) {
    actionable = false;
    reason = e.message;
  }

  return res.status(200).json({
    claimRef,
    stage: stage.n,
    stageLabel: stage.label,
    actionable,
    reason,
    status: fields.Status || 'Pending',
    ...mod.summarise(fields),
  });
}

/* ── POST: record the decision ── */
async function handlePost(req, res) {
  const { mod, stage, itemId } = await readToken(req.body?.token);
  const user = await verifyUserToken(req);
  const { decision, comment = '', signature } = req.body || {};

  if (decision !== 'approve' && decision !== 'reject')
    return res.status(400).json({ error: 'decision must be approve or reject' });

  const token  = await getAppToken();
  const siteId = await getSiteId(token);
  const fields = await getRow(token, siteId, mod, itemId);
  const claimRef = `${mod.refPrefix}-${itemId}`;

  if (!isExpectedApprover(fields, stage, user.email))
    return res.status(403).json({ error: 'This approval is addressed to someone else.' });

  // Re-checked here, not just on GET — the page could have been left open.
  assertActionable(fields, stage, (await readToken(req.body.token)).jti);

  const item = `${fields.Quantity ?? ''} × ${fields.ItemCategoryOther || fields.ItemCategory || ''}`.trim();
  const requesterEmail = fields.RequestorEmail || '';

  /* ── rejection ends it ── */
  if (decision === 'reject') {
    await patchRow(token, siteId, mod, itemId, {
      [stage.statusField]: 'Rejected',
      [stage.dateField]:   todayIso(),
      [stage.signedNameField]: user.name,
      [stage.tokenField]:  '',            // spend the link
      Status:              'Rejected',
      ApprovalNotes:       `${fields.ApprovalNotes || ''}\n[${stage.label}] Rejected by ${user.name}: ${comment}`.trim(),
    });

    if (requesterEmail) {
      try {
        await sendMail(token, {
          to: requesterEmail,
          replyTo: user.email,
          ...templates.decisionNotice({
            claimRef, item, decision: 'rejected', decidedBy: user.name,
            stageLabel: stage.label, comment, complete: true,
          }),
        });
      } catch (e) {
        console.error('[approval] rejection mail failed:', e.message);
      }
    }
    return res.status(200).json({ ok: true, decision: 'rejected', claimRef });
  }

  /* ── approval ── */
  let signatureUrl = '';
  if (signature) {
    try {
      signatureUrl = await saveSignature(token, siteId, signature, claimRef, stage.n);
    } catch (e) {
      // The decision matters more than the image; record it and note the gap.
      console.error('[approval] signature save failed:', e.message);
    }
  }

  const next = stageOf(mod, stage.n + 1);
  const patch = {
    [stage.statusField]:     'Approved',
    [stage.dateField]:       todayIso(),
    [stage.signedNameField]: user.name,
    [stage.signatureField]:  signatureUrl,
    [stage.tokenField]:      '',
    ApprovalStage:           stage.nextStage,
  };
  if (comment) {
    patch.ApprovalNotes =
      `${fields.ApprovalNotes || ''}\n[${stage.label}] Approved by ${user.name}: ${comment}`.trim();
  }

  let nextApprover = null;
  if (next) {
    // Route to whoever is registered for the next stage.
    const candidates = await approversFor(token, siteId, next.label);
    nextApprover = candidates[0] || null;
    if (!nextApprover) {
      return res.status(500).json({
        error: `No active approver is configured for "${next.label}". Add one to the Requisition Approvers list.`,
      });
    }
    const { token: nextToken, jti } = await mintToken({
      module: 'requisition', itemId, stage: next.n, approver: nextApprover.email,
    });
    patch[next.approverField] = nextApprover.email;
    patch[next.tokenField]    = jti;
    patch.__nextToken         = undefined; // not a column; kept out of the write below
    delete patch.__nextToken;

    await patchRow(token, siteId, mod, itemId, patch);

    try {
      await sendMail(token, {
        to: nextApprover.email,
        replyTo: requesterEmail || undefined,
        ...templates.approvalRequest({
          claimRef,
          requester:  fields.RequestorName || '',
          item,
          totalSGD:   Number(fields.EstimatedTotalSGD || 0).toFixed(2),
          vendor:     fields.VendorName || '',
          project:    fields.ProjectCustomer || '',
          stageLabel: next.label,
          token:      nextToken,
          ttlDays:    TOKEN_TTL_DAYS,
        }),
      });
    } catch (e) {
      console.error('[approval] next-stage mail failed:', e.message);
    }
  } else {
    // Last stage — the request is fully approved.
    patch.Status = 'Approved';
    await patchRow(token, siteId, mod, itemId, patch);
  }

  if (requesterEmail) {
    try {
      await sendMail(token, {
        to: requesterEmail,
        ...templates.decisionNotice({
          claimRef, item, decision: 'approved', decidedBy: user.name,
          stageLabel: stage.label, comment, complete: !next,
        }),
      });
    } catch (e) {
      console.error('[approval] requester mail failed:', e.message);
    }
  }

  return res.status(200).json({
    ok: true,
    decision: 'approved',
    claimRef,
    complete: !next,
    nextApprover: nextApprover?.name || null,
  });
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET')  return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[approval] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
