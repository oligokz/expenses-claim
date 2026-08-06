// Outbound mail via Graph, sent as a single shared mailbox.
//
// Requires the Mail.Send APPLICATION permission on the app registration. That
// permission alone allows sending as any mailbox in the tenant, so it must be
// scoped in Exchange to just the sender below:
//
//   New-ApplicationAccessPolicy -AppId <client-id> \
//     -PolicyScopeGroupId noreply@creoxtech.com \
//     -AccessRight RestrictAccess -Description "Forms app may only send as noreply@"
//
// Without that policy the grant is far broader than this app needs.

const SENDER = () => process.env.MAIL_SENDER || 'noreply@creoxtech.com';

/** Public base URL for links in emails. */
const baseUrl = () =>
  (process.env.APP_BASE_URL || 'https://app.creoxtech.com').replace(/\/+$/, '');

/** Minimal HTML escape — every value below comes from user input. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Send one message. Throws on failure — callers decide whether that should
 * fail the request. For notifications it should NOT: the record is already
 * written, and losing it because mail bounced would be worse than a silent
 * notification.
 */
async function sendMail(token, { to, subject, html, replyTo }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) throw new Error('sendMail: no recipients');

  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
  };
  // A no-reply sender means questions go nowhere; point replies at a human.
  if (replyTo) message.replyTo = [{ emailAddress: { address: replyTo } }];

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER())}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: false }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`sendMail failed (${res.status}): ${txt}`);
  }
}

/* ── templates ──
 * Plain table-based HTML: Outlook's renderer ignores most modern CSS, and these
 * need to survive desktop Outlook, OWA and mobile alike.
 */
function layout({ heading, intro, rows, action, footer }) {
  const cells = rows
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:6px 16px 6px 0;color:#666;font-size:14px;white-space:nowrap;vertical-align:top">${esc(k)}</td>
           <td style="padding:6px 0;font-size:14px;font-weight:600;vertical-align:top">${esc(v)}</td>
         </tr>`
    )
    .join('');

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5e5">
    <tr><td style="padding:28px 28px 20px">
      <h1 style="margin:0 0 8px;font-size:19px;font-weight:700">${esc(heading)}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.5">${esc(intro)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0">${cells}</table>
      ${
        action
          ? `<div style="margin-top:24px">
               <a href="${esc(action.href)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">${esc(action.label)}</a>
             </div>`
          : ''
      }
      ${
        footer
          ? `<p style="margin:22px 0 0;font-size:12px;color:#888;line-height:1.5">${esc(footer)}</p>`
          : ''
      }
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Ask an approver to review and sign. The link carries a single-use token, but
 * the token only identifies the request and stage — the approver still signs in
 * with Entra, so a forwarded email cannot approve anything.
 */
function approvalRequest({ claimRef, requester, item, totalSGD, vendor, project, stageLabel, token, ttlDays }) {
  return {
    subject: `Purchase requisition ${claimRef} needs your approval`,
    html: layout({
      heading: 'A purchase requisition needs your approval',
      intro: `${requester} submitted a requisition and you are the ${stageLabel.toLowerCase()} for it.`,
      rows: [
        ['Reference', claimRef],
        ['Item', item],
        ['Estimated cost', `SGD ${totalSGD}`],
        ['Vendor', vendor],
        ['Project / customer', project],
      ],
      action: {
        href: `${baseUrl()}/approve?t=${encodeURIComponent(token)}`,
        label: 'Review and sign',
      },
      footer:
        `You'll be asked to sign in first, so this link only works for you. It expires in ${ttlDays} days.`,
    }),
  };
}

/** Tell the requester the outcome of a stage, or of the whole request. */
function decisionNotice({ claimRef, item, decision, decidedBy, stageLabel, comment, complete }) {
  const approved = decision === 'approved';
  return {
    subject: `Purchase requisition ${claimRef} was ${decision}`,
    html: layout({
      heading: approved
        ? complete
          ? 'Your requisition is fully approved'
          : `${stageLabel} approved your requisition`
        : 'Your requisition was rejected',
      intro: approved
        ? complete
          ? 'Both approvals are in. You can go ahead with the purchase.'
          : 'It has moved to the next approver.'
        : `${decidedBy} rejected this request.`,
      rows: [
        ['Reference', claimRef],
        ['Item', item],
        [approved ? 'Approved by' : 'Rejected by', decidedBy],
        ['Comment', comment || ''],
      ],
      action: { href: `${baseUrl()}/`, label: 'View my requests' },
    }),
  };
}

/** Confirm to the requester that their requisition was recorded. */
function requisitionReceipt({ claimRef, item, totalSGD, approverName }) {
  return {
    subject: `Your purchase requisition ${claimRef} was recorded`,
    html: layout({
      heading: 'Requisition recorded',
      intro: 'This is your copy for reference.',
      rows: [
        ['Reference', claimRef],
        ['Item', item],
        ['Estimated cost', `SGD ${totalSGD}`],
        ['Sent to', approverName],
      ],
      footer: "You'll be notified when it has been reviewed.",
    }),
  };
}

module.exports = {
  sendMail,
  baseUrl,
  templates: { approvalRequest, requisitionReceipt, decisionNotice },
};
