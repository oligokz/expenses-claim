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

const LOGO_FILE = 'creox.png';
const logoUrl = () => `${baseUrl()}/${LOGO_FILE}`;
const LOGO_CID = 'creoxlogo';

/* Fetched once per warm function, from the app's own public folder rather than
 * the function bundle, which does not reliably include static assets. Null on
 * failure, in which case the mail falls back to a remote <img src>. */
let _logo;
async function logoBytes() {
  if (_logo !== undefined) return _logo;
  try {
    const res = await fetch(logoUrl());
    _logo = res.ok ? Buffer.from(await res.arrayBuffer()).toString('base64') : null;
  } catch {
    _logo = null;
  }
  return _logo;
}

/** Minimal HTML escape, every value below comes from user input. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Send one message. Throws on failure, callers decide whether that should
 * fail the request. For notifications it should NOT: the record is already
 * written, and losing it because mail bounced would be worse than a silent
 * notification.
 */
async function sendMail(token, { to, subject, html, replyTo }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) throw new Error('sendMail: no recipients');

  /* Outlook blocks remote images until the reader allows them, so the logo goes
   * in as an inline attachment and the remote URL is rewritten to point at it.
   * If the fetch failed, the HTML keeps the remote src and degrades to alt
   * text, which is where this started. */
  const logo = await logoBytes();
  let content = html;
  if (logo) {
    content = content.split(logoUrl()).join(`cid:${LOGO_CID}`);
  }

  const message = {
    subject,
    body: { contentType: 'HTML', content },
    toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
  };
  if (logo) {
    message.attachments = [
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: LOGO_FILE,
        contentType: 'image/png',
        contentBytes: logo,
        contentId: LOGO_CID,
        isInline: true,
      },
    ];
  }
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
function layout({ heading, intro, body, rows, action, footer }) {
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

  /* creox.png is the dark logo on transparency, so it sits on a light bar
   * rather than the app's dark one. The source is square with generous padding,
   * hence the modest render size. sendMail rewrites this src to a cid: when it
   * can attach the image inline. */
  const header = `<tr><td style="padding:20px 28px 4px;border-bottom:1px solid #eeeeee">
      <img src="${logoUrl()}" width="104" height="104" alt="CREOX"
           style="display:block;border:0;width:104px;height:104px;color:#111111;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:2px" />
    </td></tr>`;

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5e5">
    ${header}
    <tr><td style="padding:28px 28px 20px">
      <h1 style="margin:0 0 8px;font-size:19px;font-weight:700">${esc(heading)}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.5">${esc(intro)}</p>
      ${
        // Free text (an expense description, a leave reason) reads as prose, not
        // as another label/value row, so it gets its own block above the table.
        body
          ? `<div style="margin:0 0 20px;padding:12px 14px;background:#f7f7f7;border-radius:8px;font-size:14px;line-height:1.5;color:#333">${esc(body).replace(/\n/g, '<br />')}</div>`
          : ''
      }
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
 * the token only identifies the request and stage, the approver still signs in
 * with Entra, so a forwarded email cannot approve anything.
 */
function approvalRequest({
  kind, claimRef, requester, item, description, department, submittedOn,
  rows = [], stageLabel, token, ttlDays, hasAttachments,
}) {
  const what = (kind || 'Request').toLowerCase();
  const subjectItem = item ? `: ${item}` : '';
  return {
    // Name the thing in the subject line too. An approver triaging a full inbox
    // decides from the subject whether this is the one they were waiting on.
    subject: `${kind || 'Request'} ${claimRef}${subjectItem} needs your approval`,
    html: layout({
      heading: `A ${what} needs your approval`,
      intro: `${requester} submitted this and you are the ${(stageLabel || 'approver').toLowerCase()} for it.`,
      body: description,
      rows: [
        ['Reference', claimRef],
        ['Item', item || ''],
        ['Requested by', requester || ''],
        ['Department', department || ''],
        ['Submitted', submittedOn ? String(submittedOn).slice(0, 10) : ''],
        ...rows,
      ],
      action: {
        href: `${baseUrl()}/approve?t=${encodeURIComponent(token)}`,
        label: 'Review and sign',
      },
      /* Attachments are deliberately not linked from the email. The approval
       * page shows them behind a sign-in, so a forwarded message never carries
       * a working link to someone's receipts or medical certificate. */
      footer:
        (hasAttachments ? 'Attachments are shown on the approval page. ' : '') +
        `This link expires in ${ttlDays} days.`,
    }),
  };
}

/** Tell the requester the outcome of a stage, or of the whole request. */
function decisionNotice({ kind, claimRef, item, decision, decidedBy, stageLabel, comment, complete, pdfUrl }) {
  const approved = decision === 'approved';
  const what = (kind || 'Request').toLowerCase();
  return {
    subject: `${kind || 'Request'} ${claimRef} was ${decision}`,
    html: layout({
      heading: approved
        ? complete
          ? `Your ${what} is approved`
          : `${stageLabel} approved your ${what}`
        : `Your ${what} was rejected`,
      intro: approved
        ? complete
          ? 'No further approval is needed.'
          : 'It has moved to the next approver.'
        : `${decidedBy} rejected this request.`,
      rows: [
        ['Reference', claimRef],
        ['Item', item],
        [approved ? 'Approved by' : 'Rejected by', decidedBy],
        ['Comment', comment || ''],
      ],
      action:
        complete && approved && pdfUrl
          ? { href: pdfUrl, label: 'Open the signed PDF' }
          : { href: `${baseUrl()}/`, label: 'View my requests' },
    }),
  };
}

/* Tell a watcher, typically finance or HR, that a request cleared its last
 * approval. Separate from decisionNotice because that one is written to the
 * requester ("your claim is approved"), which reads wrong for a third party. */
function completionNotice({ kind, claimRef, item, requester, department, approvedBy, rows = [], pdfUrl }) {
  return {
    subject: `${kind || 'Request'} ${claimRef} is fully approved`,
    html: layout({
      heading: `${kind || 'Request'} fully approved`,
      intro: 'Every approval stage is complete. The record is in SharePoint.',
      rows: [
        ['Reference', claimRef],
        ['Item', item || ''],
        ['Requested by', requester || ''],
        ['Department', department || ''],
        ['Approved by', approvedBy || ''],
        ...rows,
      ].filter(([, v]) => v && String(v).trim() !== ''),
      action: pdfUrl
        ? { href: pdfUrl, label: 'Open the signed PDF' }
        : { href: `${baseUrl()}/`, label: 'Open the forms app' },
    }),
  };
}

/** Confirm to the requester that their travel request was recorded. */
function travelReceipt({ claimRef, destination, dates, totalSGD, approverName }) {
  return {
    subject: `Your travel request ${claimRef} was recorded`,
    html: layout({
      heading: 'Travel request recorded',
      intro: 'This is your copy for reference.',
      rows: [
        ['Reference', claimRef],
        ['Destination', destination || ''],
        ['Dates', dates || ''],
        ['Estimated cost', `SGD ${totalSGD}`],
        ['Sent to', approverName || ''],
      ],
      action: { href: `${baseUrl()}/`, label: 'View my requests' },
      footer: 'Travel requests need three approvals: reporting manager, Finance/HR, then final approval.',
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
  templates: { approvalRequest, requisitionReceipt, travelReceipt, decisionNotice, completionNotice },
};
