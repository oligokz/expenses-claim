const {
  getAppToken, getSiteId, getDriveId, verifyUserToken, applyCors,
} = require('./_lib/sharepoint');
const {
  MODULES, readToken, mintToken, getRow, getRowWithEtag, patchRow,
  assertActionable, currentStage, waitingOn, buildRoute, isExpectedApprover, TOKEN_TTL_DAYS,
} = require('./_lib/approvals');
const { sendMail, templates } = require('./_lib/mail');
const { listAttachments, topFolderFor } = require('./_lib/attachments');
const { approverName, nameLookup } = require('./_lib/approvers');
const { sendError } = require('./_lib/http');
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

/** Store a signature PNG beside the request's other attachments. */
async function saveSignature(token, siteId, dataUrl, claimRef, stageN) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Signature must be a PNG data URL');
  const buffer = Buffer.from(m[1], 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw new Error('Signature image too large');

  const driveId = await getDriveId(token, siteId);
  const month = todayIso().slice(0, 7);
  // Beside the request's own files: a travel signature belongs under Travel
  // Attachments, where deleteAttachments will also find it.
  const segments = [topFolderFor(claimRef), month, claimRef, 'signatures', `stage${stageN}.png`];

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

/* ── GET without a token: everything waiting on the signed-in person ──
 *
 * The approval email is the only way in otherwise, and an approver who can't
 * find it, or is sent the requester's copy instead (REQ-19), is stuck. This
 * lists every request whose current stage is addressed to them, each with a
 * token re-issued for the nonce already on the row, so opening one here and
 * using the emailed link are interchangeable and single-use still holds.
 *
 * Lives here rather than in its own file because the Hobby plan caps a
 * deployment at 12 functions and the app already has 12.
 */
async function pendingRows(token, siteId, mod) {
  const filter = encodeURIComponent("fields/Status eq 'Pending'");
  let url =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(mod.listName())}/items` +
    `?$expand=fields&$top=200&$filter=${filter}`;
  const rows = [];
  for (let page = 0; url && page < 10; page++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      },
    });
    if (!res.ok) throw new Error(`${mod.listName()}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    rows.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return rows;
}

/** The figure worth showing in a list row: money if there is any, else days. */
function headlineFigure(rows) {
  const money = rows.find(([, v]) => /^SGD /.test(v));
  if (money) {
    // "SGD 5000.00" reads better as "SGD 5,000.00" on a card.
    const n = Number(money[1].slice(4));
    return Number.isFinite(n)
      ? `SGD ${n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : money[1];
  }
  const days = rows.find(([k]) => k === 'Days');
  return days ? `${days[1]} ${Number(days[1]) === 1 ? 'day' : 'days'}` : '';
}

async function handleInbox(req, res) {
  const user = await verifyUserToken(req);
  if (!user.email)
    return res.status(400).json({ error: 'Token did not contain an email/username claim' });

  const token  = await getAppToken();
  const siteId = await getSiteId(token);

  const approvals = [];
  const warnings = [];
  await Promise.all(Object.entries(MODULES).map(async ([moduleName, mod]) => {
    let rows;
    try {
      rows = await pendingRows(token, siteId, mod);
    } catch (e) {
      // One unreadable list must not hide what is waiting in the others.
      console.error('[approval] inbox list failed:', e.message);
      warnings.push(`Could not load ${mod.kind.toLowerCase()}s just now.`);
      return;
    }
    for (const row of rows) {
      const fields = row.fields || {};
      const stage = currentStage(mod, fields);
      if (!stage || !isExpectedApprover(fields, stage, user.email)) continue;

      // Reuse the row's nonce so the emailed link keeps working. A row without
      // one (its email never went out) gets a fresh nonce stored now.
      let jti = fields[stage.tokenField];
      if (!jti) {
        ({ jti } = await mintToken({ module: moduleName, itemId: row.id, stage: stage.n, approver: user.email }));
        try {
          await patchRow(token, siteId, mod, row.id, { [stage.tokenField]: jti });
        } catch (e) {
          console.error('[approval] could not store nonce:', e.message);
          continue;
        }
      }
      const { token: approvalToken } = await mintToken({
        module: moduleName, itemId: row.id, stage: stage.n, approver: user.email, jti,
      });

      const summary = mod.summarise(fields);
      approvals.push({
        ref:         `${mod.refPrefix}-${row.id}`,
        type:        moduleName,
        kind:        mod.kind,
        title:       summary.title,
        requester:   summary.requester,
        department:  summary.department,
        submittedOn: summary.submittedOn || row.createdDateTime || '',
        stageLabel:  stage.label,
        // The step is only worth showing when there is more than one.
        step:        mod.stages.length > 1 && stage.label !== 'Approver' ? stage.label : '',
        // When it reached this person, for "waiting 3 days".
        since:       waitingOn(mod, fields)?.since || row.createdDateTime || '',
        figure:      headlineFigure(summary.rows),
        token:       approvalToken,
      });
    }
  }));

  // Oldest first: whatever has waited longest is the one to clear.
  approvals.sort((a, b) => new Date(a.submittedOn).getTime() - new Date(b.submittedOn).getTime());
  return res.status(200).json({ approvals, warnings });
}

/* ── POST {action: 'remind'}: the requester nudges whoever has it ──
 *
 * Resends the approval email to the current stage's approver. The link reuses
 * the nonce already on the row, so the original email keeps working too. One
 * reminder per request per REMIND_GAP_HOURS, recorded in LastReminderAt, so a
 * requester can't flood an approver's inbox.
 */
const REMIND_GAP_HOURS = 20;
const REMINDABLE = ['leave', 'expense', 'requisition', 'travel'];

async function handleRemind(req, res) {
  const user = await verifyUserToken(req);
  const { type, itemId } = req.body || {};
  if (!REMINDABLE.includes(type) || !itemId)
    return res.status(400).json({ error: 'Unknown request' });

  const mod = MODULES[type];
  const token  = await getAppToken();
  const siteId = await getSiteId(token);
  const { fields, etag } = await getRowWithEtag(token, siteId, mod, itemId);
  const summary = mod.summarise(fields);
  const claimRef = `${mod.refPrefix}-${itemId}`;

  if ((summary.requesterEmail || '').toLowerCase() !== (user.email || '').toLowerCase())
    return res.status(403).json({ error: 'You can only send reminders for your own requests.' });

  const waiting = waitingOn(mod, fields);
  if (!waiting || !waiting.email)
    return res.status(409).json({ error: 'This request is not waiting on anyone.' });

  const last = fields.LastReminderAt ? new Date(fields.LastReminderAt).getTime() : 0;
  const nextAllowed = last + REMIND_GAP_HOURS * 3600 * 1000;
  if (Date.now() < nextAllowed) {
    return res.status(429).json({
      error: 'A reminder was sent recently. You can send another tomorrow.',
      nextAllowed: new Date(nextAllowed).toISOString(),
    });
  }

  // Claim the slot first, against the row as read, so two clicks can't both send.
  let jti = fields[waiting.stage.tokenField];
  const patch = { LastReminderAt: nowIso() };
  if (!jti) {
    ({ jti } = await mintToken({ module: type, itemId, stage: waiting.stage.n, approver: waiting.email }));
    patch[waiting.stage.tokenField] = jti;
  }
  try {
    await patchRow(token, siteId, mod, itemId, patch, { ifMatch: etag || undefined });
  } catch (e) {
    if (e.code === 'etag-mismatch') return res.status(409).json({ error: 'This request just changed. Refresh and try again.' });
    throw e;
  }

  const { token: link } = await mintToken({
    module: type, itemId, stage: waiting.stage.n, approver: waiting.email, jti,
  });
  await sendMail(token, {
    to: waiting.email,
    replyTo: summary.requesterEmail || undefined,
    ...templates.approvalRequest({
      kind: mod.kind, claimRef,
      requester:   summary.requester,
      item:        summary.title,
      description: summary.description,
      department:  summary.department,
      submittedOn: summary.submittedOn,
      items:       summary.items,
      currency:    summary.currency,
      rows:        summary.rows,
      stageLabel:  waiting.stage.label,
      token:       link,
      ttlDays:     TOKEN_TTL_DAYS,
      hasAttachments: true,
      reminderSince: waiting.since,
    }),
  });

  return res.status(200).json({
    ok: true,
    claimRef,
    sentTo: await approverName(token, siteId, waiting.email),
    nextAllowed: new Date(Date.now() + REMIND_GAP_HOURS * 3600 * 1000).toISOString(),
  });
}

/* ── GET: what the approver is being asked to sign ── */
async function handleGet(req, res) {
  if (!req.query.t) return handleInbox(req, res);
  const { mod, stage, itemId, jti } = await readToken(req.query.t);
  const user = await verifyUserToken(req);

  const token  = await getAppToken();
  const siteId = await getSiteId(token);
  const fields = await getRow(token, siteId, mod, itemId);
  const claimRef = `${mod.refPrefix}-${itemId}`;

  /* Identity, not the link, decides who may see it: the row's approver for this
   * stage, as now recorded. The address baked into the link is not enough on
   * its own, since the row can be reassigned in SharePoint after it was sent. */
  if (!isExpectedApprover(fields, stage, user.email)) {
    /* Usually a forwarded email. Say where the request actually stands so the
     * person can stop worrying about it, but nothing of its contents: they are
     * not an approver of it. */
    const waiting = waitingOn(mod, fields);
    return res.status(403).json({
      error: `This approval is addressed to someone else. You are signed in as ${user.email}.`,
      notYours: {
        claimRef,
        kind: mod.kind,
        status: fields.Status || 'Pending',
        isRequester:
          (mod.summarise(fields).requesterEmail || '').toLowerCase() === (user.email || '').toLowerCase(),
        withName: waiting ? await approverName(token, siteId, waiting.email) : null,
        withStage: waiting ? waiting.stage.label : null,
        since: waiting ? waiting.since : null,
      },
    });
  }

  // Surface a spent or superseded link as a readable state, not an error page.
  let actionable = true;
  let reason = '';
  try {
    assertActionable(fields, stage, jti);
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
    route: buildRoute(mod, fields, await nameLookup(token, siteId)),
    ...mod.summarise(fields),
  });
}

/* ── POST: record the decision ── */
async function handlePost(req, res) {
  const { mod, moduleName, stage, itemId, jti } = await readToken(req.body?.token);
  const user = await verifyUserToken(req);
  const { decision, comment = '', signature } = req.body || {};

  if (decision !== 'approve' && decision !== 'reject')
    return res.status(400).json({ error: 'decision must be approve or reject' });

  const token  = await getAppToken();
  const siteId = await getSiteId(token);
  const { fields, etag } = await getRowWithEtag(token, siteId, mod, itemId);
  const claimRef = `${mod.refPrefix}-${itemId}`;

  if (!isExpectedApprover(fields, stage, user.email))
    return res.status(403).json({ error: 'This approval is addressed to someone else.' });

  // Re-checked here, not just on GET, the page could have been left open.
  assertActionable(fields, stage, jti);

  /* Record the decision only if the row hasn't moved since we checked it, so
   * two submissions racing each other can't both land. A tag mismatch alone
   * isn't proof of a race (any column edit changes it), so on a mismatch the
   * row is re-checked: if the stage is still waiting on this link, nothing
   * decided it in between and the write goes ahead. */
  const commit = async (patch) => {
    try {
      return await patchRow(token, siteId, mod, itemId, patch, { ifMatch: etag || undefined });
    } catch (e) {
      if (e.code !== 'etag-mismatch') throw e;
      assertActionable(await getRow(token, siteId, mod, itemId), stage, jti);
      return patchRow(token, siteId, mod, itemId, patch);
    }
  };

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
    const rejectPatch = {
      [stage.statusField]: 'Rejected',
      [stage.dateField]:   nowIso(),
      [stage.signedNameField]: user.name,
      [stage.tokenField]:  '',            // spend the link
      Status:              'Rejected',
      ...noteWith('Rejected'),
    };
    await commit(rejectPatch);

    if (requesterEmail) {
      try {
        await sendMail(token, {
          to: requesterEmail,
          replyTo: user.email,
          ...templates.decisionNotice({
            kind: mod.kind, claimRef, item, decision: 'rejected',
            decidedBy: user.name, stageLabel: stage.label, comment, complete: true,
            route: buildRoute(mod, { ...fields, ...rejectPatch }, await nameLookup(token, siteId)),
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
   * requester nominated, not by the module. The next stage is the first later
   * one with an approver on the row; none means this approval is the last. */
  const next =
    mod.stages.find((s) => s.n > stage.n && (fields[s.approverField] || '').trim()) || null;
  const patch = {
    [stage.statusField]:     'Approved',
    [stage.dateField]:       nowIso(),
    [stage.signedNameField]: user.name,
    [stage.tokenField]:      '',
  };
  // Single-stage modules have neither a signature column nor a stage column.
  if (stage.signatureField) patch[stage.signatureField] = signatureUrl;
  // Where it actually goes next. A requisition with no second approver used to
  // be left at 'Final Approval' after its only approval.
  if (mod.stageField) patch[mod.stageField] = next ? next.listValue : 'Complete';
  if (comment) Object.assign(patch, noteWith('Approved'));

  let nextApprover = null;
  let pdfUrl = '';
  if (next) {
    // The next approver was chosen by the requester at submit and is already on
    // the row; look up their display name only so the email reads properly.
    const nextEmail = (fields[next.approverField] || '').trim();
    nextApprover = { name: await approverName(token, siteId, nextEmail), email: nextEmail };

    const { token: nextToken, jti: nextJti } = await mintToken({
      module: moduleName, itemId, stage: next.n, approver: nextEmail,
    });
    patch[next.tokenField] = nextJti;

    await commit(patch);

    try {
      await sendMail(token, {
        to: nextApprover.email,
        replyTo: requesterEmail || undefined,
        ...templates.approvalRequest({
          kind:       mod.kind,
          claimRef,
          requester:  summary.requester,
          // Same content as the first-stage email, so the second approver sees
          // what is being bought, not just the total.
          item:        summary.title,
          description: summary.description,
          department:  summary.department,
          submittedOn: summary.submittedOn,
          items:       summary.items,
          currency:    summary.currency,
          hasAttachments: true,
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
    await commit(patch);

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
      /* Everyone still to approve, in order, so the requester knows exactly
       * who it is pending with. The step is named only when more than one is
       * left, since that is when the order matters. */
      const left = next
        ? mod.stages.filter((s) => s.n >= next.n && (fields[s.approverField] || '').trim())
        : [];
      const remaining = await Promise.all(left.map(async (s) => ({
        name: await approverName(token, siteId, fields[s.approverField].trim()),
        stageLabel: left.length > 1 ? s.label : '',
      })));
      await sendMail(token, {
        to: requesterEmail,
        ...templates.decisionNotice({
          kind: mod.kind, claimRef, item, decision: 'approved',
          decidedBy: user.name, stageLabel: stage.label,
          comment, complete: !next, pdfUrl,
          nextApprover: nextApprover?.name || null,
          remaining,
          route: buildRoute(
            mod,
            { ...fields, ...patch, ...(next ? {} : { Status: 'Approved' }) },
            await nameLookup(token, siteId),
          ),
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
            items:      summary.items,
            currency:   summary.currency,
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
    if (req.method === 'POST' && req.body?.action === 'remind') return await handleRemind(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return sendError(req, res, err, 'approval');
  }
};
