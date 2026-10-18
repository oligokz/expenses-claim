const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { notifyApprover } = require('./_lib/notify');
const { assertApproversAllowed } = require('./_lib/approvers');
const { getRates, toSGD } = require('./_lib/rates');
const { createListItem, withColumnReport } = require('./_lib/lists');
const { sendError } = require('./_lib/http');

const LIST = () => process.env.SP_LIST_NAME;

module.exports = async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Identity comes from the verified token, NOT the request body.
    const user = await verifyUserToken(req);

    const { department, submissionDate, lineItems, notes,
            receiptCount, approverEmail } = req.body || {};

    const employeeName  = user.name;
    const employeeEmail = user.email;

    if (!employeeEmail)
      return res.status(400).json({ error: 'Token did not contain an email/username claim' });
    if (!department || !submissionDate)
      return res.status(400).json({ error: 'Missing required fields' });
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(submissionDate)))
      return res.status(400).json({ error: 'Submission date must be a date' });
    if (!lineItems || !lineItems.length)
      return res.status(400).json({ error: 'At least one line item required' });

    // One expense per submission, write it to flat columns.
    const item = lineItems[0] || {};

    /* Recompute the money server-side, from server-fetched rates, so the stored
     * SGD total is trusted rather than whatever the client posted. */
    const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const amount   = Number(item.amount) || 0;
    const currency = item.currency || 'SGD';
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });
    const rates = await getRates();
    const totalSGD = toSGD(amount * quantity, currency, rates);
    if (totalSGD === null)
      return res.status(400).json({ error: `No exchange rate available for ${currency}` });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    /* The form no longer asks for an approver (claims are handled in SharePoint),
     * but if one is sent it must still come from the roster and not be the
     * requester. */
    await assertApproversAllowed(token, siteId, employeeEmail, [approverEmail]);

    const fields = {
      Title:          `${employeeName} - ${submissionDate}`,
      EmployeeName:   employeeName,
      EmployeeEmail:  employeeEmail,
      Department:     department,
      SubmissionDate: submissionDate,
      // Flat expense columns (single entry per claim)
      Category:       item.category || '',
      Description:    item.description || '',
      ReceiptDate:    item.receiptDate || null,
      Quantity:       quantity,
      Currency:       currency,
      Amount:         amount,
      TotalAmountSGD: totalSGD,
      Notes:          notes || '',
      Status:         'Pending',
      ApproverEmail:  approverEmail || '',
      ReceiptCount:   Math.max(0, Math.floor(Number(receiptCount) || 0)),
      // The rates the total was actually computed from, not the client's copy.
      ExchangeRates:  JSON.stringify(rates),
    };

    const created = await withColumnReport(token, siteId, LIST(), fields,
      () => createListItem(token, siteId, LIST(), fields));
    const itemId   = created?.id || 'unknown';
    const claimRef = `EXP-${itemId}`;
    const { notified, mailError } = await notifyApprover(token, siteId, {
      moduleName: 'expense', itemId, approverEmail,
    });
    return res.status(200).json({ success: true, itemId, claimRef, totalSGD, notified, mailError });

  } catch (err) {
    return sendError(req, res, err, 'submit');
  }
};
