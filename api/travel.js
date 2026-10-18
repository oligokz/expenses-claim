const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { sendMail, templates } = require('./_lib/mail');
const { mintToken, getModule, patchRow, TOKEN_TTL_DAYS } = require('./_lib/approvals');
const { assertApproversAllowed, approverName } = require('./_lib/approvers');
const { createListItem, withColumnReport } = require('./_lib/lists');
const { sendError } = require('./_lib/http');

const LIST = () => process.env.SP_TRAVEL_LIST_NAME || 'Travel Requests';

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
      purpose, eventName, destination, travelFrom, travelTo, agenda,
      costFlight, costHotel, costEventFees, costTransport, costOther, costOtherNote,
      reportingManager, financeApprover, finalApprover,
    } = req.body || {};

    if (!department || !purpose || !destination || !travelFrom || !travelTo)
      return res.status(400).json({ error: 'Missing required fields' });

    // The first stage has to exist or the request never reaches anyone.
    if (!String(reportingManager || '').trim())
      return res.status(400).json({ error: 'Select the reporting manager' });

    if (String(travelTo) < String(travelFrom))
      return res.status(400).json({ error: 'The return date cannot be before the departure date' });

    /* Recompute the budget server-side so the stored total is trusted, not
     * whatever the client posted. Budget is SGD throughout, so there is no
     * conversion to do. */
    const n = (v) => {
      const x = Number(v);
      return Number.isFinite(x) && x > 0 ? parseFloat(x.toFixed(2)) : 0;
    };
    const flight    = n(costFlight);
    const hotel     = n(costHotel);
    const eventFees = n(costEventFees);
    const transport = n(costTransport);
    const other     = n(costOther);
    const total = parseFloat((flight + hotel + eventFees + transport + other).toFixed(2));

    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    // Approvers must come from the roster, and never be the requester.
    await assertApproversAllowed(token, siteId, user.email,
      [reportingManager, financeApprover, finalApprover]);

    const submittedAt    = new Date().toISOString();
    const submissionDate = submittedAt.slice(0, 10);

    const fields = {
      Title:            `${user.name} - ${destination} - ${submissionDate}`,
      RequestorName:    user.name,
      RequestorEmail:   user.email,
      Department:       department,
      JobTitle:         jobTitle || '',
      SubmissionDate:   submittedAt,

      PurposeOfTravel:  purpose,
      EventName:        eventName || '',
      Destination:      destination,
      TravelFrom:       travelFrom,
      TravelTo:         travelTo,
      Agenda:           agenda || '',

      CostFlight:       flight,
      CostHotel:        hotel,
      CostEventFees:    eventFees,
      CostTransport:    transport,
      CostOther:        other,
      CostOtherNote:    costOtherNote || '',
      TotalEstimatedSGD: total,

      Status:           'Pending',
      ApprovalStage:    'Reporting Manager',
      ReportingManager: reportingManager || '',
      ReportingManagerStatus: 'Pending',
      FinanceApprover:  financeApprover || '',
      FinalApprover:    finalApprover || '',
    };

    const created = await withColumnReport(token, siteId, LIST(), fields,
      () => createListItem(token, siteId, LIST(), fields));

    const itemId   = created?.id || 'unknown';
    const claimRef = `TRV-${itemId}`;

    let notified = false;
    let mailError = null;

    if (reportingManager) {
      try {
        const mod = getModule('travel');
        const stage = mod.stages[0];

        // The nonce can only be written once the row exists: the item id is
        // part of what the token authorises.
        const { token: approvalToken, jti } = await mintToken({
          module: 'travel', itemId, stage: stage.n, approver: reportingManager,
        });
        await patchRow(token, siteId, mod, itemId, { [stage.tokenField]: jti });

        const money = total.toLocaleString('en-SG', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
        const dates = `${travelFrom} to ${travelTo}`;

        await sendMail(token, {
          to: reportingManager,
          // Replies go to the requester, not into the no-reply mailbox.
          replyTo: user.email,
          ...templates.approvalRequest({
            kind:        mod.kind,
            claimRef,
            requester:   user.name,
            item:        `Travel to ${destination}`,
            description: agenda || '',
            department,
            submittedOn: submissionDate,
            rows: [
              ['Purpose',        purpose],
              ['Event',          eventName || ''],
              ['Destination',    destination],
              ['Dates',          dates],
              ['Estimated cost', `SGD ${money}`],
            ].filter(([, v]) => v && String(v).trim() !== ''),
            stageLabel: stage.label,
            token:      approvalToken,
            ttlDays:    TOKEN_TTL_DAYS,
            hasAttachments: true,
          }),
        });

        const name = await approverName(token, siteId, reportingManager);
        await sendMail(token, {
          to: user.email,
          ...templates.travelReceipt({
            claimRef,
            destination,
            dates,
            totalSGD: money,
            approverName: name,
          }),
        });

        notified = true;
      } catch (mailErr) {
        mailError = 'The approver could not be emailed.';
        console.error('[travel] notify failed:', mailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      itemId,
      claimRef,
      totalSGD: total,
      notified,
      mailError,
    });
  } catch (err) {
    return sendError(req, res, err, 'travel');
  }
};
