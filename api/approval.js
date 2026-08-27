const {
  getAppToken, getSiteId, getDriveId, verifyUserToken, applyCors,
} = require('./_lib/sharepoint');
const {
  readToken, mintToken, getRow, patchRow,
  assertActionable, isExpectedApprover, stageOf, TOKEN_TTL_DAYS,
} = require('./_lib/approvals');
const { sendMail, templates } = require('./_lib/mail');
const { listAttachments } = require('./_lib/attachments');
const { buildRequisitionPdf, buildTravelPdf, storePdf, fetchDriveFile } = require('./_lib/pdf');

/* Which document a module renders once it is fully approved. Keyed by prefix
 * rather than set on the module config, so approvals.js stays free of any
 * dependency on the PDF layer. */
const PDF_BUILDERS = {
  REQ: buildRequisitionPdf,
  TRV: buildTravelPdf,
};

const todayIso = () => new Date().toISOString().slice(0, 10);
// Decisions record the moment, not just the day, the PDF shows a real time.
const nowIso = () => new Date().toISOString();

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
  const segments = ['Requisition Attachments', month, claimRef, 'signatures', `stage${stageN}.png`];

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${segments.map(encodeURIComponent).join('/')}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body: buffer,
    }
  );
  if (!res.ok) throw new Error(`Signature upload failed (${res.status})`);
  await res.json();
  // Store the drive path, not the webUrl: the PDF composer has to fetch these
  // bytes back, and a path is what Graph can resolve.
  return segments.join('/');
}

/**
 * Compose and store the signed PDF. Called once, after the final approval.
 * Failure here must not undo the approval, the row is the record and the PDF
 * can be rebuilt from it, so we report the problem and carry on.
 */
async function renderPdf(token, siteId, mod, itemId, claimRef) {
  const fields = await getRow(token, siteId, mod, itemId);

  const signatures = [];
  for (const stage of mod.stages) {
    const path = fields[stage.signatureField];
    let png = null;
    if (path) {
      try {
        png = await fetchDriveFile(token, siteId, path);
      } catch (e) {
        console.error('[approval] signature fetch failed:', e.message);
      }
    }
    signatures.push({
      stage: stage.n,
      label: stage.label,
      name:  fields[stage.signedNameField] || fields[stage.approverField] || '',
      date:  fields[stage.dateField] || '',
      png,
    });
  }

  const build = PDF_BUILDERS[mod.refPrefix];
  if (!build) throw new Error(`No PDF builder for ${mod.refPrefix}`);
  const bytes = await build({ fields, claimRef, signatures });
  const month = (fields.SubmissionDate || todayIso()).slice(0, 7);
  const { webUrl } = await storePdf(token, siteId, bytes, claimRef, month);

  if (webUrl) {
    await patchRow(token, siteId, mod, itemId, { ApprovedPdfUrl: webUrl });
  }
  return webUrl;
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

  // Receipts, MCs and quotations, so the decision can be made on the evidence
  // rather than on the figures alone.
  const attachments = await listAttachments(token, siteId, claimRef, [
    fields.SubmissionDate,
    fields.StartDate,
  ]);

  return res.status(200).json({
    claimRef,
    kind: mod.kind,
    stage: stage.n,
    stageLabel: stage.label,
    // Only requisitions ask for a drawing; the rest are approve or reject.
    requiresSignature: !!mod.signature,
    actionable,
    reason,
    status: fields.Status || 'Pending',
    attachments,
    ...mod.summarise(fields),
  });
}

/* ── POST: record the decision ── */
async function handlePost(req, res) {
  const { mod, moduleName, stage, itemId } = await readToken(req.body?.token);
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

  // Re-checked here, not just on GET, the page could have been left open.
  assertActionable(fields, stage, (await readToken(req.body.token)).jti);

  const summary = mod.summarise(fields);
  const item = summary.title || '';
  const requesterEmail = summary.requesterEmail || '';

  /** Append to whichever notes column this module uses. */
  const noteWith = (verb) => {
    if (!mod.notesField) return {};
    const existing = fields[mod.notesField] || '';
    return {
      [mod.notesField]:
        `${existing}\n[${stage.label}] ${verb} by ${user.name}${comment ? `: ${comment}` : ''}`.trim(),
    };
  };

  /* ── rejection ends it ── */
  if (decision === 'reject') {
    await patchRow(token, siteId, mod, itemId, {
      [stage.statusField]: 'Rejected',
      [stage.dateField]:   nowIso(),
      [stage.signedNameField]: user.name,
      [stage.tokenField]:  '',            // spend the link
      Status:              'Rejected',
      ...noteWith('Rejected'),
    });

    if (requesterEmail) {
      try {
        await sendMail(token, {
          to: requesterEmail,
          replyTo: user.email,
          ...templates.decisionNotice({
            kind: mod.kind, claimRef, item, decision: 'rejected',
            decidedBy: user.name, stageLabel: stage.label, comment, complete: true,
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
  if (signature && stage.signatureField) {
    try {
      signatureUrl = await saveSignature(token, siteId, signature, claimRef, stage.n);
    } catch (e) {
      // The decision matters more than the image; record it and note the gap.
      console.error('[approval] signature save failed:', e.message);
    }
  }

  /* How many stages a request has is decided by how many approvers the
   * requester nominated, not by the module. A blank next-stage approver means
   * this approval is the last one. */
  const candidateNext = stageOf(mod, stage.n + 1);
  const next =
    candidateNext && (fields[candidateNext.approverField] || '').trim()
      ? candidateNext
      : null;
  const patch = {
    [stage.statusField]:     'Approved',
    [stage.dateField]:       nowIso(),
    [stage.signedNameField]: user.name,
    [stage.tokenField]:      '',
  };
  // Single-stage modules have neither a signature column nor a stage column.
  if (stage.signatureField) patch[stage.signatureField] = signatureUrl;
  if (mod.stageField) patch[mod.stageField] = stage.nextStage;
  if (comment) Object.assign(patch, noteWith('Approved'));

  let nextApprover = null;
  let pdfUrl = '';
  if (next) {
    // The next approver was chosen by the requester at submit and is already on
    // the row; look up their display name only so the email reads properly.
    const nextEmail = (fields[next.approverField] || '').trim();
    const candidates = await approversFor(token, siteId, next.listValue);
    nextApprover = candidates.find(
      (c) => c.email.toLowerCase() === nextEmail.toLowerCase()
    ) || { name: nextEmail, email: nextEmail };

    const { token: nextToken, jti } = await mintToken({
      module: moduleName, itemId, stage: next.n, approver: nextEmail,
    });
    patch[next.tokenField] = jti;

    await patchRow(token, siteId, mod, itemId, patch);

    try {
      await sendMail(token, {
        to: nextApprover.email,
        replyTo: requesterEmail || undefined,
        ...templates.approvalRequest({
          kind:       mod.kind,
          claimRef,
          requester:  summary.requester,
          rows:       summary.rows,
          stageLabel: next.label,
          token:      nextToken,
          ttlDays:    TOKEN_TTL_DAYS,
        }),
      });
    } catch (e) {
      console.error('[approval] next-stage mail failed:', e.message);
    }
  } else {
    // Last stage, the request is fully approved.
    patch.Status = 'Approved';
    await patchRow(token, siteId, mod, itemId, patch);

    if (mod.pdf) {
      try {
        pdfUrl = await renderPdf(token, siteId, mod, itemId, claimRef);
      } catch (e) {
        // The approval stands regardless; the PDF is a rendering of the row and
        // can be rebuilt. Better a missing document than a lost decision.
        console.error('[approval] pdf render failed:', e.message);
      }
    }
  }

  if (requesterEmail) {
    try {
      await sendMail(token, {
        to: requesterEmail,
        ...templates.decisionNotice({
          kind: mod.kind, claimRef, item, decision: 'approved',
          decidedBy: user.name, stageLabel: stage.label,
          comment, complete: !next, pdfUrl,
        }),
      });
    } catch (e) {
      console.error('[approval] requester mail failed:', e.message);
    }
  }

  /* Copy the watchers once the request has cleared its last stage. Opt-in via
   * NOTIFY_ON_APPROVED (comma-separated); unset means nobody is copied, which
   * is the behaviour this had before. Failure must not affect the decision. */
  if (!next) {
    const watchers = (process.env.NOTIFY_ON_APPROVED || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (watchers.length) {
      try {
        await sendMail(token, {
          to: watchers,
          replyTo: requesterEmail || undefined,
          ...templates.completionNotice({
            kind: mod.kind, claimRef, item,
            requester:  summary.requester,
            department: summary.department,
            approvedBy: user.name,
            rows:       summary.rows,
            pdfUrl,
          }),
        });
      } catch (e) {
        console.error('[approval] watcher mail failed:', e.message);
      }
    }
  }

  return res.status(200).json({
    ok: true,
    decision: 'approved',
    claimRef,
    complete: !next,
    nextApprover: nextApprover?.name || null,
    pdfUrl: pdfUrl || null,
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
