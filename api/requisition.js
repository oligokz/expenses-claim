const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

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
      itemCategory, itemCategoryOther, description,
      quantity, unitPrice, currency = 'SGD',
      vendorName, vendorContact, vendorEmail,
      projectCustomer, reportingManager,
      quotationAttached, exchangeRates,
    } = req.body;

    if (!department || !itemCategory || !description || !vendorName)
      return res.status(400).json({ error: 'Missing required fields' });

    const qty   = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;
    if (qty <= 0) return res.status(400).json({ error: 'Quantity must be greater than zero' });

    // Recompute the money server-side so the stored figures are trusted, not
    // whatever the client happened to post.
    const estimatedTotal = parseFloat((qty * price).toFixed(2));
    const rate = currency === 'SGD' ? 1 : Number((exchangeRates || {})[currency]) || 0;
    const estimatedTotalSGD = rate
      ? parseFloat((estimatedTotal / rate).toFixed(2))
      : estimatedTotal;

    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    const submissionDate = new Date().toISOString().slice(0, 10);
    const category = itemCategory === 'Others' && itemCategoryOther
      ? itemCategoryOther
      : itemCategory;

    const fields = {
      Title:             `${user.name} - ${category} - ${submissionDate}`,
      RequestorName:     user.name,
      RequestorEmail:    user.email,
      Department:        department,
      JobTitle:          jobTitle || '',
      SubmissionDate:    submissionDate,

      ItemCategory:      itemCategory,
      ItemCategoryOther: itemCategoryOther || '',
      Description:       description,
      Quantity:          qty,
      UnitPrice:         price,
      Currency:          currency,
      EstimatedTotal:    estimatedTotal,
      EstimatedTotalSGD: estimatedTotalSGD,
      ExchangeRates:     JSON.stringify(exchangeRates || {}),

      VendorName:        vendorName,
      VendorContact:     vendorContact || '',
      VendorEmail:       vendorEmail || '',
      QuotationAttached: !!quotationAttached,

      ProjectCustomer:   projectCustomer || '',

      // Approval columns are written empty on purpose. The requisition lands as
      // Pending at the first stage; who fills these in (a person editing the
      // list, a Power Automate flow, or a future in-app view) is not decided
      // here — the shape just has to support all three without a migration.
      Status:                 'Pending',
      ApprovalStage:          'Reporting Manager',
      ReportingManager:       reportingManager || '',
      ReportingManagerStatus: 'Pending',
      FinalApprovalStatus:    'Pending',
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

    const itemId = created?.id || 'unknown';
    return res.status(200).json({
      success: true,
      itemId,
      claimRef: `REQ-${itemId}`,
      estimatedTotal,
      estimatedTotalSGD,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[requisition] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
