const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

/* Who may approve a requisition, from the "Requisition Approvers" SharePoint
 * list, so the set is bounded and editable without a redeploy.
 * Columns: Title (display name), ApproverEmail, ApprovalStage
 * ('Reporting Manager' | 'Final Approval' | 'Both'), Department (blank = all),
 * Active (yes/no), SortOrder (number).
 */
async function listApprovers(token, siteId) {
  const listName = process.env.SP_REQAPPROVERS_LIST_NAME || 'Requisition Approvers';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?$expand=fields&$top=200`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const rows = ((await res.json()).value || []).map((i) => i.fields || {});
  return rows
    .filter((f) => f.Active !== false) // treat missing Active as active
    .filter((f) => f.ApproverEmail)
    .sort((a, b) => (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0))
    .map((f) => ({
      name:       f.Title || f.ApproverEmail,
      email:      f.ApproverEmail,
      stage:      f.ApprovalStage || 'Reporting Manager',
      department: f.Department || '',
    }));
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await verifyUserToken(req); // any signed-in user may read the approver list
    const token  = await getAppToken();
    const siteId = await getSiteId(token);
    const all    = await listApprovers(token, siteId);
    if (!all) return res.status(200).json({ approvers: [] });

    // ?stage=reporting returns only those who can act at stage 1. 'Both' counts
    // for either stage.
    const stage = String(req.query.stage || '').toLowerCase();
    const wanted =
      stage === 'reporting' ? 'Reporting Manager' :
      stage === 'final'     ? 'Final Approval'    : null;

    const approvers = wanted
      ? all.filter((a) => a.stage === wanted || a.stage === 'Both')
      : all;

    return res.status(200).json({ approvers });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[approvers] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
