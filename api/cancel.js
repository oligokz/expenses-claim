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
const { sendError } = require('./_lib/http');
const { getModule, getRow, getRowWithEtag, currentStage } = require('./_lib/approvals');
const { deleteAttachments } = require('./_lib/attachments');
const { sendMail, templates } = require('./_lib/mail');

const ALLOWED = ['expense', 'leave', 'travel', 'requisition'];

/** DELETE the row. With `ifMatch`, Graph refuses (412) if the row changed since it was read. */
async function deleteItem(token, siteId, mod, itemId, ifMatch) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(mod.listName())}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
    }
  );
  if (res.status === 412) return false;
  if (!res.ok && res.status !== 204) {
    throw new Error(`Could not delete the request (${res.status}): ${await res.text()}`);
  }
  return true;
}

/** Why this row can't be deleted by its requester, or null if it can. */
function blockedReason(mod, fields) {
  const status = fields.Status || 'Pending';
  if (status !== 'Pending') return `This request was already ${String(status).toLowerCase()} and can no longer be deleted.`;
  /* Overall Status stays Pending until the last stage, so it alone would let a
   * requester erase a request an approver has already signed. */
  const signed = mod.stages.find((s) => fields[s.statusField] === 'Approved');
  if (signed) return `The ${signed.label.toLowerCase()} has already approved this, so it can no longer be deleted.`;
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

    const { fields, etag } = await getRowWithEtag(token, siteId, mod, itemId);
    const summary = mod.summarise(fields);
    const claimRef = `${mod.refPrefix}-${itemId}`;

    // Guard 1: it has to be yours.
    const owner = (summary.requesterEmail || '').trim().toLowerCase();
    if (!owner || owner !== user.email.trim().toLowerCase()) {
      return res.status(403).json({ error: 'You can only delete your own requests.' });
    }

    // Guard 2: a decided request, or one any stage has approved, is a record.
    const blocked = blockedReason(mod, fields);
    if (blocked) return res.status(409).json({ error: blocked });

    /* Delete only if nothing changed since the checks above, so an approval
     * landing in between can't be wiped. A tag mismatch alone isn't proof of an
     * approval (any column edit changes it), so re-check and only then delete
     * without the tag. */
    if (!(await deleteItem(token, siteId, mod, itemId, etag || undefined))) {
      const again = blockedReason(mod, await getRow(token, siteId, mod, itemId));
      if (again) return res.status(409).json({ error: again });
      await deleteItem(token, siteId, mod, itemId);
    }

    /* Tell the waiting approver only once the row is really gone. A mail
     * failure is reported, never fatal: the request is already deleted. */
    const stage = currentStage(mod, fields);
    const waiting = stage && { stage, approver: fields[stage.approverField].trim() };
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

    // Best effort, and never fatal: an orphaned folder beats a half-done delete.
    const filesRemoved = await deleteAttachments(token, siteId, claimRef, [
      fields.SubmissionDate,
      fields.StartDate,
    ]);

    return res.status(200).json({ success: true, claimRef, notified, filesRemoved });
  } catch (err) {
    return sendError(req, res, err, 'cancel');
  }
};
