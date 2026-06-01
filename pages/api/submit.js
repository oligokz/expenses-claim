/**
 * pages/api/submit.js
 *
 * POST /api/submit
 * Accepts the expense claim form data, verifies the user's identity,
 * then writes a new item to the SharePoint ExpenseClaims list using
 * app-level credentials. The browser never gets a SharePoint token.
 */

import { verifyIdToken }            from '../../lib/verifyToken';
import { getAppToken, getSiteId, createListItem } from '../../lib/sharepoint';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verify the user's identity from the ID token in the Authorization header
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    const user = await verifyIdToken(idToken);

    // 2. Parse the submitted form payload
    const {
      employeeName,
      employeeEmail,
      department,
      submissionDate,
      lineItems,      // array of line item objects
      notes,
      exchangeRates,
    } = req.body;

    // 3. Basic server-side validation
    if (!employeeName || !employeeEmail || !department || !submissionDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!lineItems || !lineItems.length) {
      return res.status(400).json({ error: 'At least one line item required' });
    }

    // 4. Calculate total in SGD server-side (don't trust client total)
    const totalSGD = lineItems.reduce((sum, item) => {
      return sum + (item.amountSGD || 0);
    }, 0);

    // 5. Get app-level SharePoint token (client credentials — never sent to browser)
    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    // 6. Write to SharePoint list
    const fields = {
      Title:           `${employeeName} — ${submissionDate}`,
      EmployeeName:    employeeName,
      EmployeeEmail:   employeeEmail,
      Department:      department,
      SubmissionDate:  submissionDate,
      TotalAmountSGD:  parseFloat(totalSGD.toFixed(2)),
      LineItemsJSON:   JSON.stringify(lineItems),
      Notes:           notes || '',
      Status:          'Pending',
      ReceiptCount:    req.body.receiptCount || 0,
      ExchangeRates:   JSON.stringify(exchangeRates || {}),
      SubmittedByOID:  user.oid,   // Azure AD object ID for audit trail
    };

    const created = await createListItem(token, siteId, fields);
    const itemId  = created?.id || 'unknown';

    return res.status(200).json({
      success: true,
      itemId,
      message: `Claim submitted successfully. Reference: #${itemId}`,
    });

  } catch (err) {
    console.error('[submit] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
