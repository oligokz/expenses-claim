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

// Diagnostic: list the target list's columns with their data type, so we can
// tell exactly which field is missing or has a mismatched type when a write fails.
async function describeColumns(token, siteId) {
  const listName = process.env.SP_LIST_NAME;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/columns`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const typeOf = (c) =>
    c.text ? 'text'
    : c.number ? 'number'
    : c.dateTime ? 'dateTime'
    : c.choice ? 'choice'
    : c.currency ? 'currency'
    : c.boolean ? 'boolean'
    : c.personOrGroup ? 'person'
    : c.lookup ? 'lookup'
    : c.calculated ? 'calculated(read-only)'
    : 'other';
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

    // One expense per submission — write it to flat columns.
    const item = lineItems[0] || {};

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
      Quantity:       item.quantity || 1,
      Currency:       item.currency || 'SGD',
      Amount:         item.amount || 0,
      TotalAmountSGD: parseFloat((item.amountSGD || 0).toFixed(2)),
      Notes:          notes || '',
      Status:         'Pending',
      ReceiptCount:   receiptCount || 0,
      ExchangeRates:  JSON.stringify(exchangeRates || {}),
    };

    let created;
    try {
      created = await createListItem(token, siteId, fields);
    } catch (writeErr) {
      // Turn Graph's opaque "generalException" into something actionable by
      // reporting each field we sent alongside the actual column type it maps to.
      const cols = await describeColumns(token, siteId).catch(() => null);
      if (cols) {
        const report = Object.keys(fields)
          .map((f) => `${f}=${cols[f] || 'MISSING'}`)
          .join(', ');
        writeErr.message += ` | columns: ${report}`;
      }
      throw writeErr;
    }
    const itemId   = created?.id || 'unknown';
    const claimRef = `EXP-${itemId}`;
    return res.status(200).json({ success: true, itemId, claimRef });

  } catch(err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[submit] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
