// Let a requester delete their own request.
//
// A real delete, not a Cancelled status: the ask was that a wrong submission
// disappears from the SharePoint list. Graph moves the row and its attachment
// folder to the site recycle bin rather than destroying them, so an admin can
// still recover a deletion made by mistake.
//
// Two guards, both enforced server-side against the verified token rather than
// anything the client sends:
//   1. the signed-in user must be the requester on the row
//   2. the request must still be Pending
// The second matters most: an approved claim is the record of a decision
// somebody signed, and it is not the requester's to erase.

const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { getModule, getRow } = require('./_lib/approvals');
const { deleteAttachments } = require('./_lib/attachments');
const { sendMail, templates } = require('./_lib/mail');

const ALLOWED = ['expense', 'leave', 'travel', 'requisition'];

async function deleteItem(token, siteId, mod, itemId) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(mod.listName())}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`Could not delete the request (${res.status}): ${await res.text()}`);
  }
}

/** The stage still waiting on someone, so we can tell them to stand down. */
function pendingStage(mod, fields) {
  for (const stage of mod.stages) {
    const status = fields[stage.statusField];
    const approver = (fields[stage.approverField] || '').trim();
    if (approver && (!status || status === 'Pending')) return { stage, approver };
  }
  return null;
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyUserToken(req);
    if (!user.email)
      return res.status(400).json({ error: 'Token did not contain an email/username claim' });

    const { type, itemId } = req.body || {};
    if (!ALLOWED.includes(type))
      return res.status(400).json({ error: 'Unknown request type' });
    if (!itemId) return res.status(400).json({ error: 'Missing itemId' });

    const mod = getModule(type);
    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    const fields = await getRow(token, siteId, mod, itemId);
    const summary = mod.summarise(fields);
    const claimRef = `${mod.refPrefix}-${itemId}`;

    // Guard 1: it has to be yours.
    const owner = (summary.requesterEmail || '').trim().toLowerCase();
    if (!owner || owner !== user.email.trim().toLowerCase()) {
      return res.status(403).json({ error: 'You can only delete your own requests.' });
    }

    // Guard 2: a decided request is a record, not a draft.
    const status = fields.Status || 'Pending';
    if (status !== 'Pending') {
      return res.status(409).json({
        error: `This request was already ${String(status).toLowerCase()} and can no longer be deleted.`,
      });
    }

    /* Tell the waiting approver before the row goes, since the notice is built
     * from it. A mail failure must not block the delete: the person asked for
     * this to disappear, and leaving it behind because Exchange hiccuped would
     * be the wrong trade. */
    const waiting = pendingStage(mod, fields);
    let notified = false;
    if (waiting) {
      try {
        await sendMail(token, {
          to: waiting.approver,
          replyTo: summary.requesterEmail || undefined,
          ...templates.withdrawnNotice({
            kind: mod.kind,
            claimRef,
            item: summary.title,
            requester: summary.requester,
            stageLabel: waiting.stage.label,
          }),
        });
        notified = true;
      } catch (e) {
        console.error('[cancel] withdrawal mail failed:', e.message);
      }
    }

    await deleteItem(token, siteId, mod, itemId);

    // Best effort, and never fatal: an orphaned folder beats a half-done delete.
    const filesRemoved = await deleteAttachments(token, siteId, claimRef, [
      fields.SubmissionDate,
      fields.StartDate,
    ]);

    return res.status(200).json({ success: true, claimRef, notified, filesRemoved });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[cancel] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
