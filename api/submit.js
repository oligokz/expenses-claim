const { verifyIdToken }   = require('../lib/verifyToken');
const { getAppToken, getSiteId, createListItem } = require('../lib/sharepoint');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const authHeader = req.headers.authorization || '';
    const idToken    = authHeader.replace('Bearer ', '').trim();
    const user       = await verifyIdToken(idToken);

    const { employeeName, employeeEmail, department, submissionDate,
            lineItems, notes, exchangeRates, receiptCount } = req.body;

    if (!employeeName || !employeeEmail || !department || !submissionDate)
      return res.status(400).json({ error: 'Missing required fields' });
    if (!lineItems || !lineItems.length)
      return res.status(400).json({ error: 'At least one line item required' });

    const totalSGD = lineItems.reduce((s, i) => s + (i.amountSGD || 0), 0);
    const token    = await getAppToken();
    const siteId   = await getSiteId(token);

    const fields = {
      Title:          `${employeeName} — ${submissionDate}`,
      EmployeeName:    employeeName,
      EmployeeEmail:   employeeEmail,
      Department:      department,
      SubmissionDate:  submissionDate,
      TotalAmountSGD:  parseFloat(totalSGD.toFixed(2)),
      LineItemsJSON:   JSON.stringify(lineItems),
      Notes:           notes || '',
      Status:          'Pending',
      ReceiptCount:    receiptCount || 0,
      ExchangeRates:   JSON.stringify(exchangeRates || {}),
      SubmittedByOID:  user.oid,
    };

    const created = await createListItem(token, siteId, fields);
    return res.status(200).json({ success: true, itemId: created?.id || 'unknown' });
  } catch(err) {
    console.error('[submit]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
