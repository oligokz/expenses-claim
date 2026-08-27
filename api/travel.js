const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { sendMail, templates } = require('./_lib/mail');
const { mintToken, getModule, TOKEN_TTL_DAYS } = require('./_lib/approvals');

const LIST = () => process.env.SP_TRAVEL_LIST_NAME || 'Travel Requests';

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

async function createItem(token, siteId, fields) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(LIST())}/items`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) throw new Error(`createTravelItem failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Same diagnostic as the other modules: report each field against its column
// type so a failed write names the column that's missing or mistyped.
async function describeColumns(token, siteId) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(LIST())}/columns`,
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
      purpose, eventName, destination, travelFrom, travelTo, agenda,
      costFlight, costHotel, costEventFees, costTransport, costOther, costOtherNote,
      reportingManager, financeApprover, finalApprover,
    } = req.body;

    if (!department || !purpose || !destination || !travelFrom || !travelTo)
      return res.status(400).json({ error: 'Missing required fields' });

    if (String(travelTo) < String(travelFrom))
      return res.status(400).json({ error: 'The return date cannot be before the departure date' });

    /* Same control as requisition: nominating yourself as your own approver is
     * a weakness, gated behind BLOCK_SELF_APPROVAL so the flow stays testable. */
    if (process.env.BLOCK_SELF_APPROVAL === 'true') {
      const me = user.email.trim().toLowerCase();
      const mine = [reportingManager, financeApprover, finalApprover]
        .filter(Boolean)
        .map((e) => e.trim().toLowerCase());
      if (mine.includes(me))
        return res.status(400).json({ error: 'You cannot nominate yourself as an approver.' });
    }

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

    let created;
    try {
      created = await createItem(token, siteId, fields);
    } catch (writeErr) {
      const cols = await describeColumns(token, siteId).catch(() => null);
      if (cols) {
        writeErr.message +=
          ` | columns: ${Object.keys(fields).map((f) => `${f}=${cols[f] || 'MISSING'}`).join(', ')}`;
      }
      throw writeErr;
    }

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
        const patchRes = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(LIST())}/items/${itemId}/fields`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ Stage1TokenId: jti }),
          }
        );
        if (!patchRes.ok) throw new Error(`Could not store approval token (${patchRes.status})`);

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
        mailError = mailErr.message;
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
    const status = err.status || 500;
    if (status >= 500) console.error('[travel] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
