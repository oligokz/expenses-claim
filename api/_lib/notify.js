// Mint an approval link, store its nonce on the row, and email the approver.
//
// Shared by the single-stage modules (leave, expense). The nonce can only be
// written once the row exists, because the item id is part of what the token
// authorises, so this always runs after the create.

const { getModule, mintToken, getRow, patchRow, TOKEN_TTL_DAYS } = require('./approvals');
const { sendMail, templates } = require('./mail');

/**
 * @returns {Promise<{notified: boolean, mailError: string|null}>}
 * Never throws. The row is already written by the time this runs, so a mail
 * failure must not fail the request; it is reported instead.
 */
async function notifyApprover(token, siteId, { moduleName, itemId, approverEmail }) {
  if (!approverEmail) return { notified: false, mailError: null };

  const mod = getModule(moduleName);
  if (!mod) return { notified: false, mailError: `Unknown module ${moduleName}` };

  const stage = mod.stages[0];
  const claimRef = `${mod.refPrefix}-${itemId}`;

  try {
    const fields = await getRow(token, siteId, mod, itemId);
    const summary = mod.summarise(fields);

    const { token: approvalToken, jti } = await mintToken({
      module: moduleName, itemId, stage: stage.n, approver: approverEmail,
    });
    await patchRow(token, siteId, mod, itemId, { [stage.tokenField]: jti });

    await sendMail(token, {
      to: approverEmail,
      // Replies reach the requester rather than the no-reply mailbox.
      replyTo: summary.requesterEmail || undefined,
      ...templates.approvalRequest({
        kind:       mod.kind,
        claimRef,
        requester:  summary.requester,
        rows:       summary.rows,
        stageLabel: stage.label,
        token:      approvalToken,
        ttlDays:    TOKEN_TTL_DAYS,
      }),
    });

    return { notified: true, mailError: null };
  } catch (err) {
    console.error(`[${moduleName}] notify failed:`, err.message);
    return { notified: false, mailError: err.message };
  }
}

module.exports = { notifyApprover };
