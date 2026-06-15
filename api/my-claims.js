const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

// Fetch this user's claim rows. We filter SERVER-SIDE on the verified email so a
// user can only ever see their own claims, never anyone else's.
async function listMyItems(token, siteId, email) {
  const listName = process.env.SP_LIST_NAME;
  const safe = email.replace(/'/g, "''"); // escape single quotes for OData
  const url =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items` +
    `?$expand=fields&$top=200&$filter=fields/EmployeeEmail eq '${safe}'`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      // Allow filtering on a non-indexed column for modest list sizes.
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`my-claims list failed (${res.status}): ${txt}`);
  }
  return (await res.json()).value || [];
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyUserToken(req);
    if (!user.email)
      return res.status(400).json({ error: 'Token did not contain an email/username claim' });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);
    const items  = await listMyItems(token, siteId, user.email);

    items.sort(
      (a, b) => new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime()
    );

    const claims = items.map((it) => {
      const f = it.fields || {};
      return {
        id:             it.id,
        claimRef:       `EXP-${it.id}`,
        submissionDate: f.SubmissionDate || '',
        category:       f.Category || '',
        description:    f.Description || '',
        amount:         f.Amount ?? 0,
        currency:       f.Currency || 'SGD',
        totalSGD:       f.TotalAmountSGD ?? 0,
        status:         f.Status || 'Pending',
        department:     f.Department || '',
      };
    });

    return res.status(200).json({ claims });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[my-claims] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
