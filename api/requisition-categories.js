const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

// Admin-managed item categories from the "Requisition Categories" SharePoint list,
// so procurement can add a category without a redeploy.
// Columns expected: Title (the category name), Active (yes/no), SortOrder (number).
// Not 'Order' — SharePoint reserves that name for a built-in hidden field, so a
// column called Order cannot be created and its value never round-trips.
async function listCategories(token, siteId) {
  const listName = process.env.SP_REQCATEGORIES_LIST_NAME || 'Requisition Categories';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?$expand=fields&$top=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const rows = ((await res.json()).value || []).map((i) => i.fields || {});
  return rows
    .filter((f) => f.Active !== false) // treat missing Active as active
    .sort((a, b) => (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0))
    .map((f) => ({ name: f.Title || f.Name || '' }))
    .filter((c) => c.name);
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await verifyUserToken(req); // any signed-in user may read the category list
    const token      = await getAppToken();
    const siteId     = await getSiteId(token);
    const categories = await listCategories(token, siteId);
    return res.status(200).json({ categories: categories || [] });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[requisition-categories] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
