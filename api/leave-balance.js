const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

async function itemsByEmail(token, siteId, listName, email, top) {
  if (!listName) return [];
  const safe = email.replace(/'/g, "''");
  const url =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items` +
    `?$expand=fields&$top=${top}&$filter=fields/EmployeeEmail eq '${safe}'`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  });
  if (!res.ok) return [];
  return ((await res.json()).value || []).map((i) => i.fields || {});
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

    const entRows = await itemsByEmail(token, siteId, process.env.SP_ENTITLEMENTS_LIST_NAME, user.email, 5);
    const leaves  = await itemsByEmail(token, siteId, process.env.SP_LEAVE_LIST_NAME, user.email, 500);
    const ent = entRows[0] || null;

    // Sum approved leave days per type for the current calendar year.
    const year = new Date().getUTCFullYear();
    const taken = {};
    for (const f of leaves) {
      if ((f.Status || '') !== 'Approved') continue;
      const start = f.StartDate ? new Date(f.StartDate) : null;
      if (!start || start.getUTCFullYear() !== year) continue;
      const t = f.LeaveType || '';
      taken[t] = (taken[t] || 0) + (Number(f.Days) || 0);
    }

    const mk = (entitlement, takenDays) => {
      const e = Number(entitlement) || 0;
      const tk = takenDays || 0;
      return { entitlement: e, taken: tk, remaining: e - tk };
    };

    const balance = {
      annual:        mk(ent && ent.AnnualDays,        taken['Annual']),
      medical:       mk(ent && ent.MedicalDays,       taken['Medical']),
      compassionate: mk(ent && ent.CompassionateDays, taken['Compassionate']),
    };

    return res.status(200).json({ balance, hasEntitlements: !!ent });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[leave-balance] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
