const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { listApprovers } = require('./_lib/approvers');

module.exports = async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyUserToken(req); // any signed-in user may read the approver list
    const token  = await getAppToken();
    const siteId = await getSiteId(token);
    const roster = await listApprovers(token, siteId);
    if (!roster) return res.status(200).json({ approvers: [] });

    // Don't offer the caller themselves; the submit endpoints refuse it anyway.
    const me = (user.email || '').trim().toLowerCase();
    const all = process.env.ALLOW_SELF_APPROVAL === 'true'
      ? roster
      : roster.filter((a) => a.email.trim().toLowerCase() !== me);

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
