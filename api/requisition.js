const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { sendMail, templates } = require('./_lib/mail');
const { mintToken, getModule, patchRow, TOKEN_TTL_DAYS } = require('./_lib/approvals');
const { assertApproversAllowed, approverName } = require('./_lib/approvers');
const { createListItem, withColumnReport } = require('./_lib/lists');
const { sendError } = require('./_lib/http');
const { sgDay } = require('./_lib/dates');
const { getRates, toSGD } = require('./_lib/rates');
const { money } = require('./_lib/format');
const {
  normaliseItems, itemsTitle, itemsHeadline, flatColumns,
} = require('./_lib/requisitionItems');

const LIST = () => process.env.SP_REQUISITION_LIST_NAME || 'Purchase Requisitions';

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
    } = req.body || {};

    if (!department || !vendorName)
      return res.status(400).json({ error: 'Missing required fields' });
    // Without a first approver the requisition is saved but never reaches anyone.
    if (!String(reportingManager || '').trim())
      return res.status(400).json({ error: 'Select the reporting manager' });
    // Two signatures, as on the paper form: a manager, then final approval.
    if (!String(finalApprover || '').trim())
      return res.status(400).json({ error: 'Select the final approver' });
    if (String(finalApprover).trim().toLowerCase() === String(reportingManager).trim().toLowerCase())
      return res.status(400).json({ error: 'Choose someone other than the reporting manager for final approval' });

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

    // Approvers must come from the roster, for the stage they were picked for,
    // and never be the requester. The form offers each stage its own list.
    await assertApproversAllowed(token, siteId, user.email, [
      { email: reportingManager, stage: 'Reporting Manager' },
      { email: finalApprover,    stage: 'Final Approval' },
    ]);

    const submittedAt    = new Date().toISOString();
    // Date-only for the Title and folder paths; the column keeps the full
    // timestamp so the PDF can show a real time rather than a fake midnight.
    // The Singapore day: before 8 am the UTC date is still yesterday.
    const submissionDate = sgDay(submittedAt);
    const title    = itemsTitle(items);
    const headline = itemsHeadline(items);

    const fields = {
      Title:             `${user.name} - ${title} - ${submissionDate}`.slice(0, 255),
      RequestorName:     user.name,
      RequestorEmail:    user.email,
      Department:        department,
      JobTitle:          jobTitle || '',
      SubmissionDate:    submittedAt,

      ...flatColumns(items, currency),
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

    const created = await withColumnReport(token, siteId, LIST(), fields, async () => {
      try {
        return await createListItem(token, siteId, LIST(), fields);
      } catch (firstErr) {
        /* LineItems is a newer column; a list set up before it existed rejects
         * the field. Save without it rather than lose the request: the flat
         * columns still carry every item, prices included, in Description.
         * Add the column (scripts/setup-requisition-lists.mjs) to get the
         * items table back on new requests. */
        if (!/LineItems/.test(firstErr.message)) throw firstErr;
        console.error('[requisition] LineItems column missing, saving without it');
        const { LineItems, ...withoutItems } = fields;
        return createListItem(token, siteId, LIST(), withoutItems);
      }
    });

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
        const fmtMoney = money(estimatedTotalSGD);

        /* The approval link's nonce can only be stored once the row exists -
         * the item id is part of what the token authorises. Write it back, then
         * send; a link whose nonce isn't on the row is rejected as spent. */
        const { token: approvalToken, jti } = await mintToken({
          module: 'requisition', itemId, stage: 1, approver: reportingManager,
        });
        await patchRow(token, siteId, getModule('requisition'), itemId, { Stage1TokenId: jti });

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
          stageLabel: getModule('requisition').stages[0].label,
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
        mailError = 'The approver could not be emailed.';
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
    return sendError(req, res, err, 'requisition');
  }
};
