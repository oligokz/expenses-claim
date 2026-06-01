const { getAppToken, getSiteId, createListItem } = require('../lib/sharepoint');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Log env vars presence (values hidden) to help diagnose config issues
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

    console.log('[submit] Getting app token…');
    const token = await getAppToken();
    console.log('[submit] Got token ✓, getting site ID…');
    const siteId = await getSiteId(token);
    console.log('[submit] Got siteId ✓:', siteId);

    const totalSGD = lineItems.reduce((s, i) => s + (i.amountSGD || 0), 0);
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
    };

    console.log('[submit] Creating list item…');
    const created = await createListItem(token, siteId, fields);
    console.log('[submit] Created ✓, ID:', created?.id);
    return res.status(200).json({ success: true, itemId: created?.id || 'unknown' });

  } catch(err) {
    // Log full error details to Vercel logs
    console.error('[submit] ERROR:', err.message);
    // Always return valid JSON even on error
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
