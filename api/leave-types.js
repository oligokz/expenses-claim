const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

// Admin-managed leave types from the "Leave Types" SharePoint list.
// Columns expected: Title (text), Active (yes/no), and a sort column.
//
// The sort column is 'Order0' on the live list: SharePoint reserves 'Order',
// so creating it through the UI silently lands as 'Order0'. Reading plain
// 'Order' therefore always came back undefined and every row sorted as 0.
// Accept whichever name the list actually uses.
const sortKey = (f) => Number(f.Order0 ?? f.SortOrder ?? f.Order) || 0;

async function listTypes(token, siteId) {
  const listName = process.env.SP_LEAVETYPES_LIST_NAME || 'Leave Types';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?$expand=fields&$top=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const rows = ((await res.json()).value || []).map((i) => i.fields || {});
  return rows
    .filter((f) => f.Active !== false) // treat missing Active as active
    .sort((a, b) => (sortKey(a) - sortKey(b)))
    .map((f) => ({ name: f.Title || f.Name || '' }))
    .filter((t) => t.name);
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await verifyUserToken(req); // any signed-in user may read the type list
    const token  = await getAppToken();
    const siteId = await getSiteId(token);
    const types  = await listTypes(token, siteId);
    return res.status(200).json({ types: types || [] });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[leave-types] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
