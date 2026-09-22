const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { sendMail, templates } = require('./_lib/mail');
const { mintToken, getModule, TOKEN_TTL_DAYS } = require('./_lib/approvals');
const { assertApproversAllowed } = require('./_lib/approvers');
const { getRates, toSGD } = require('./_lib/rates');
const {
  normaliseItems, itemsTitle, itemsHeadline, flatColumns,
} = require('./_lib/requisitionItems');

/** Resolve an approver's display name from the approvers list, for the email. */
async function approverName(token, siteId, email) {
  if (!email) return '';
  try {
    const listName = process.env.SP_REQAPPROVERS_LIST_NAME || 'Requisition Approvers';
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?$expand=fields&$top=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return email;
    const rows = ((await res.json()).value || []).map((i) => i.fields || {});
    const hit = rows.find(
      (f) => (f.ApproverEmail || '').toLowerCase() === email.toLowerCase()
    );
    return hit?.Title || email;
  } catch {
    return email;
  }
}

async function createRequisitionItem(token, siteId, fields) {
  const listName = process.env.SP_REQUISITION_LIST_NAME || 'Purchase Requisitions';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`createRequisitionItem failed (${res.status}): ${txt}`);
  }
  return res.json();
}

// Same diagnostic as submit.js / leave.js: report each field against its column
// type so a failed write names the column that's missing or mistyped.
async function describeColumns(token, siteId) {
  const listName = process.env.SP_REQUISITION_LIST_NAME || 'Purchase Requisitions';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/columns`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const typeOf = (c) =>
    c.text ? 'text' : c.number ? 'number' : c.dateTime ? 'dateTime'
    : c.choice ? 'choice' : c.currency ? 'currency' : c.boolean ? 'boolean'
    : c.personOrGroup ? 'person' : c.calculated ? 'calculated(read-only)' : 'other';
  const map = {};
  for (const c of data.value || []) map[c.name] = typeOf(c) + (c.readOnly ? ' [readOnly]' : '');
  return map;
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Identity comes from the verified token, NOT the request body.
    const user = await verifyUserToken(req);
    if (!user.email)
      return res.status(400).json({ error: 'Token did not contain an email/username claim' });

    const {
      department, jobTitle,
      items: rawItems, currency = 'SGD',
      vendorName, vendorContact, vendorEmail,
      projectCustomer, reportingManager, finalApprover,
      quotationAttached,
    } = req.body;

    if (!department || !vendorName)
      return res.status(400).json({ error: 'Missing required fields' });

    const items = normaliseItems(rawItems);

    /* Recompute the money server-side, from server-fetched rates, so the stored
     * figures are trusted rather than whatever the client happened to post. */
    const estimatedTotal = parseFloat(items.reduce((s, it) => s + it.total, 0).toFixed(2));
    const rates = await getRates();
    const estimatedTotalSGD = toSGD(estimatedTotal, currency, rates);
    if (estimatedTotalSGD === null)
      return res.status(400).json({ error: `No exchange rate available for ${currency}` });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    // Approvers must come from the roster, and never be the requester.
    await assertApproversAllowed(token, siteId, user.email, [reportingManager, finalApprover]);

    const submittedAt    = new Date().toISOString();
    // Date-only for the Title and folder paths; the column keeps the full
    // timestamp so the PDF can show a real time rather than a fake midnight.
    const submissionDate = submittedAt.slice(0, 10);
    const title    = itemsTitle(items);
    const headline = itemsHeadline(items);

    const fields = {
      Title:             `${user.name} - ${title} - ${submissionDate}`.slice(0, 255),
      RequestorName:     user.name,
      RequestorEmail:    user.email,
      Department:        department,
      JobTitle:          jobTitle || '',
      SubmissionDate:    submittedAt,

      ...flatColumns(items),
      LineItems:         JSON.stringify(items),
      Currency:          currency,
      EstimatedTotal:    estimatedTotal,
      EstimatedTotalSGD: estimatedTotalSGD,
      // The rates the total was actually computed from, not the client's copy.
      ExchangeRates:     JSON.stringify(rates),

      VendorName:        vendorName,
      VendorContact:     vendorContact || '',
      VendorEmail:       vendorEmail || '',
      QuotationAttached: !!quotationAttached,

      ProjectCustomer:   projectCustomer || '',

      // Approval columns are written empty on purpose. The requisition lands as
      // Pending at the first stage; who fills these in (a person editing the
      // list, a Power Automate flow, or a future in-app view) is not decided
      // here, the shape just has to support all three without a migration.
      Status:                 'Pending',
      ApprovalStage:          'Reporting Manager',
      ReportingManager:       reportingManager || '',
      ReportingManagerStatus: 'Pending',
      // Both approvers are chosen at submit. An empty FinalApprover means one
      // stage is enough, and stage 1 becomes the final approval, the same
      // shape leave and expense will use.
      FinalApprover:          finalApprover || '',
      FinalApprovalStatus:    finalApprover ? 'Pending' : '',
    };

    let created;
    try {
      created = await createRequisitionItem(token, siteId, fields);
    } catch (writeErr) {
      const cols = await describeColumns(token, siteId).catch(() => null);
      if (cols) {
        writeErr.message +=
          ' | columns: ' + Object.keys(fields).map((f) => `${f}=${cols[f] || 'MISSING'}`).join(', ');
      }
      throw writeErr;
    }

    const itemId   = created?.id || 'unknown';
    const claimRef = `REQ-${itemId}`;

    /* Notify, but never at the cost of the record. The row is already written;
     * if mail fails the requisition still exists, so we report the failure
     * rather than throwing it and making the client think nothing was saved. */
    let notified = false;
    let mailError = null;
    if (reportingManager) {
      try {
        const name = await approverName(token, siteId, reportingManager);
        const fmtMoney = estimatedTotalSGD.toLocaleString('en-SG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        /* The approval link's nonce can only be stored once the row exists -
         * the item id is part of what the token authorises. Write it back, then
         * send; a link whose nonce isn't on the row is rejected as spent. */
        const { token: approvalToken, jti } = await mintToken({
          module: 'requisition', itemId, stage: 1, approver: reportingManager,
        });
        const mod = getModule('requisition');
        const patchRes = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(mod.listName())}/items/${itemId}/fields`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ Stage1TokenId: jti }),
          }
        );
        if (!patchRes.ok) throw new Error(`Could not store approval token (${patchRes.status})`);

        /* approvalRequest renders a `rows` table. This used to pass totalSGD,
         * vendor and project as loose keys the template never read, so the
         * first-stage email arrived with nothing but a reference number. */
        const toApprover = templates.approvalRequest({
          kind:        getModule('requisition').kind,
          claimRef,
          requester:   user.name,
          item:        headline,
          department,
          submittedOn: submissionDate,
          items,
          currency,
          rows: [
            ['Estimated total', `SGD ${fmtMoney}`],
            ['Vendor',          vendorName || ''],
            ['Vendor contact',  vendorContact || ''],
            ['Project / customer', projectCustomer || ''],
          ].filter(([, v]) => v && String(v).trim() !== ''),
          stageLabel: 'First Approver',
          token:      approvalToken,
          ttlDays:    TOKEN_TTL_DAYS,
          hasAttachments: true,
        });
        // Replies go to the requester, not into the no-reply mailbox.
        await sendMail(token, { to: reportingManager, replyTo: user.email, ...toApprover });

        const toRequester = templates.requisitionReceipt({
          claimRef,
          item:         headline,
          totalSGD:     fmtMoney,
          approverName: name,
        });
        await sendMail(token, { to: user.email, ...toRequester });

        notified = true;
      } catch (mailErr) {
        mailError = mailErr.message;
        console.error('[requisition] notify failed:', mailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      itemId,
      claimRef,
      estimatedTotal,
      estimatedTotalSGD,
      notified,
      mailError,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[requisition] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
