// All SharePoint logic is inlined here — Vercel serverless functions
// cannot require files outside the /api directory without a build step.

let _cachedToken = null, _tokenExpiry = 0, _siteId = null;

async function getAppToken() {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;
  const url  = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  _cachedToken = data.access_token;
  _tokenExpiry = now + (data.expires_in - 300) * 1000;
  return _cachedToken;
}

async function getSiteId(token) {
  if (_siteId) return _siteId;
  const spUrl    = process.env.SP_SITE_URL;
  const hostname = new URL(spUrl).hostname;
  const sitePath = new URL(spUrl).pathname;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`getSiteId failed (${res.status}): ${txt}`);
  }
  _siteId = (await res.json()).id;
  return _siteId;
}

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  console.log('[submit] Env check:', {
    hasTenantId:     !!process.env.AZURE_TENANT_ID,
    hasClientId:     !!process.env.AZURE_CLIENT_ID,
    hasClientSecret: !!process.env.AZURE_CLIENT_SECRET,
    hasSiteUrl:      !!process.env.SP_SITE_URL,
    hasListName:     !!process.env.SP_LIST_NAME,
    siteUrl:         process.env.SP_SITE_URL,
    listName:        process.env.SP_LIST_NAME,
  });

  try {
    const { employeeName, employeeEmail, department, submissionDate,
            lineItems, notes, exchangeRates, receiptCount } = req.body;

    if (!employeeName || !employeeEmail || !department || !submissionDate)
      return res.status(400).json({ error: 'Missing required fields' });
    if (!lineItems || !lineItems.length)
      return res.status(400).json({ error: 'At least one line item required' });

    console.log('[submit] Getting token…');
    const token  = await getAppToken();
    console.log('[submit] Token OK. Getting site ID…');
    const siteId = await getSiteId(token);
    console.log('[submit] Site ID OK:', siteId);

    const totalSGD = lineItems.reduce((s, i) => s + (i.amountSGD || 0), 0);

    // Build human-readable line item summary for easy Excel export
    // e.g. "1x Travel — Airfare (USD 250.00 = SGD 337.84)\n2x Office Supplies (SGD 45.00)"
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

    console.log('[submit] Creating list item…');
    const created = await createListItem(token, siteId, fields);
    console.log('[submit] Success! ID:', created?.id);
    return res.status(200).json({ success: true, itemId: created?.id || 'unknown' });

  } catch(err) {
    console.error('[submit] ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
