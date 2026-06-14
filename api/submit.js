const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

async function createListItem(token, siteId, fields) {
  const listName = process.env.SP_LIST_NAME;
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
    throw new Error(`createListItem failed (${res.status}): ${txt}`);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Identity comes from the verified token, NOT the request body.
    const user = await verifyUserToken(req);

    const { department, submissionDate, lineItems, notes,
            exchangeRates, receiptCount } = req.body;

    const employeeName  = user.name;
    const employeeEmail = user.email;

    if (!employeeEmail)
      return res.status(400).json({ error: 'Token did not contain an email/username claim' });
    if (!department || !submissionDate)
      return res.status(400).json({ error: 'Missing required fields' });
    if (!lineItems || !lineItems.length)
      return res.status(400).json({ error: 'At least one line item required' });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    const totalSGD = lineItems.reduce((s, i) => s + (i.amountSGD || 0), 0);

    // Build human-readable line item summary for easy Excel export
    // e.g. "1. Airfare [Travel] — Qty 1 × USD 250.00 = SGD 337.84"
    const lineItemsSummary = lineItems.map((item, idx) => {
      const qty    = item.quantity || 1;
      const cur    = item.currency || 'SGD';
      const amt    = (item.amount || 0).toFixed(2);
      const sgd    = (item.amountSGD || 0).toFixed(2);
      const curStr = cur === 'SGD' ? `SGD ${amt}` : `${cur} ${amt} = SGD ${sgd}`;
      return `${idx+1}. ${item.description || '(no description)'} [${item.category || 'Uncategorised'}] — Qty ${qty} × ${curStr}`;
    }).join('\n');

    // Currencies used (deduplicated)
    const currenciesUsed = [...new Set(lineItems.map(i => i.currency || 'SGD'))].join(', ');

    const fields = {
      Title:            `${employeeName} — ${submissionDate}`,
      EmployeeName:      employeeName,
      EmployeeEmail:     employeeEmail,
      Department:        department,
      SubmissionDate:    submissionDate,
      TotalAmountSGD:    parseFloat(totalSGD.toFixed(2)),
      // Human-readable columns for HR
      LineItemCount:     lineItems.length,
      CurrenciesUsed:    currenciesUsed,
      LineItemsSummary:  lineItemsSummary,
      Notes:             notes || '',
      Status:            'Pending',
      ReceiptCount:      receiptCount || 0,
      // Raw JSON kept for system use (hidden in HR view)
      LineItemsJSON:     JSON.stringify(lineItems),
      ExchangeRates:     JSON.stringify(exchangeRates || {}),
    };

    const created = await createListItem(token, siteId, fields);
    return res.status(200).json({ success: true, itemId: created?.id || 'unknown' });

  } catch(err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[submit] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
