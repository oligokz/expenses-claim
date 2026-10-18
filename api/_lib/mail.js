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

const { categoryLabel } = require('./requisitionItems');

const SENDER = () => process.env.MAIL_SENDER || 'noreply@creoxtech.com';

/** Public base URL for links in emails. */
const baseUrl = () =>
  (process.env.APP_BASE_URL || 'https://app.creoxtech.com').replace(/\/+$/, '');

/* Deep links into the app's tabs. The bare origin opens the expense form, which
 * is the wrong page for anyone following a link about an existing request. */
const myRequestsUrl = () => `${baseUrl()}/my-requests`;
const approvalsUrl = () => `${baseUrl()}/approvals`;

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
/** A requisition's line items as their own table, above the summary rows. */
function itemsTable(items, currency) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const money = (n) =>
    Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const th = 'padding:6px 8px;font-size:12px;color:#666;font-weight:600;text-align:left;border-bottom:1px solid #e5e5e5';
  const td = 'padding:8px;font-size:13px;vertical-align:top;border-bottom:1px solid #f0f0f0';
  const num = `${td};text-align:right;white-space:nowrap`;
  const rows = items.map((it, i) => `<tr>
      <td style="${td};color:#888">${i + 1}</td>
      <td style="${td}"><strong>${esc(categoryLabel(it))}</strong><br /><span style="color:#555">${esc(it.description).replace(/\n/g, '<br />')}</span></td>
      <td style="${num}">${esc(it.quantity)}</td>
      <td style="${num}">${it.unitPrice == null ? '–' : esc(money(it.unitPrice))}</td>
      <td style="${num};font-weight:600">${esc(money(it.total))}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse">
    <tr>
      <th style="${th}">#</th>
      <th style="${th}">Item</th>
      <th style="${th};text-align:right">Qty</th>
      <th style="${th};text-align:right">Unit (${esc(currency || 'SGD')})</th>
      <th style="${th};text-align:right">Total (${esc(currency || 'SGD')})</th>
    </tr>
    ${rows}
  </table>`;
}

/* The approval route as a vertical timeline, built from tables so it holds
 * up in Outlook. Desktop Outlook ignores border-radius, so its dots render
 * square; everything else still reads correctly. */
const STEP_STYLE = {
  done:     { dot: 'background:#10b981;border:2px solid #10b981', badge: 'Done',     badgeCss: 'color:#047857;background:#ecfdf5;border:1px solid #a7f3d0', text: '#111111' },
  current:  { dot: 'background:#111111;border:2px solid #111111', badge: 'Pending',  badgeCss: 'color:#ffffff;background:#111111;border:1px solid #111111', text: '#111111' },
  upcoming: { dot: 'background:#ffffff;border:2px solid #d4d4d8', badge: 'Upcoming', badgeCss: 'color:#71717a;background:#ffffff;border:1px solid #e4e4e7', text: '#a1a1aa' },
  rejected: { dot: 'background:#dc2626;border:2px solid #dc2626', badge: 'Rejected', badgeCss: 'color:#b91c1c;background:#fef2f2;border:1px solid #fecaca', text: '#111111' },
};

/** "15 Oct 2026, 10:00 am" in Singapore time; date only when there is no time. */
function whenText(value) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  if (dateOnly) return shortDate(value, true);
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const time = d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' }).toLowerCase();
  // Date-only columns come back as midnight; a "12:00 am" there means nothing.
  return /^12:00\sam$/.test(time) ? shortDate(value, true) : `${shortDate(value, true)}, ${time}`;
}

/** What happened at a step, in words. Mirrors src/components/Timeline.tsx. */
function stepText(s, prev) {
  if (s.label === 'Submitted') return s.date ? `Submitted ${whenText(s.date)}` : 'Submitted';
  const what =
    s.status === 'done' ? (s.date ? `Approved ${whenText(s.date)}` : 'Approved')
    : s.status === 'rejected' ? (s.date ? `Rejected ${whenText(s.date)}` : 'Rejected')
    : s.status === 'current' ? (prev?.date ? `Waiting since ${whenText(prev.date)}` : 'Waiting')
    : prev ? `After ${prev.name}` : '';
  return [s.label !== s.name ? s.label : '', what].filter(Boolean).join(' · ');
}

function timelineHtml(steps) {
  if (!steps || !steps.length) return '';
  const rowsHtml = steps.map((s, i) => {
    const st = STEP_STYLE[s.status] || STEP_STYLE.upcoming;
    const last = i === steps.length - 1;
    const sub = stepText(s, steps[i - 1]);
    return `<tr>
      <td width="22" style="width:22px;vertical-align:top;padding:3px 0 0">
        <div style="width:10px;height:10px;border-radius:50%;${st.dot};margin:0 auto"></div>
        ${last ? '' : '<div style="width:2px;height:34px;background:#e4e4e7;margin:4px auto 0"></div>'}
      </td>
      <td style="vertical-align:top;padding:0 0 ${last ? '0' : '10px'} 10px">
        <span style="font-size:14px;font-weight:600;color:${st.text}">${esc(s.name)}</span>
        <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;${st.badgeCss}">${st.badge}</span>
        ${sub ? `<div style="font-size:12px;color:#888888;margin-top:2px">${esc(sub)}</div>` : ''}
      </td>
    </tr>`;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${rowsHtml}</table>`;
}

function layout({ heading, intro, body, items, currency, rows, action, footer, timeline }) {
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
      ${timelineHtml(timeline)}
      ${
        // Free text (an expense description, a leave reason) reads as prose, not
        // as another label/value row, so it gets its own block above the table.
        body
          ? `<div style="margin:0 0 20px;padding:12px 14px;background:#f7f7f7;border-radius:8px;font-size:14px;line-height:1.5;color:#333">${esc(body).replace(/\n/g, '<br />')}</div>`
          : ''
      }
      ${itemsTable(items, currency)}
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

/** "14 Oct", or "14 Oct 2026" with the year, in Singapore time. */
function shortDate(value, withYear = false) {
  if (!value) return '';
  const d = new Date(String(value).length === 10 ? `${value}T00:00:00+08:00` : value);
  if (isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'Asia/Singapore',
  });
}

/**
 * Ask an approver to review and sign. The link carries a single-use token, but
 * the token only identifies the request and stage, the approver still signs in
 * with Entra, so a forwarded email cannot approve anything.
 */
function approvalRequest({
  kind, claimRef, requester, item, description, department, submittedOn,
  rows = [], items, currency, stageLabel, token, ttlDays, hasAttachments,
  /** Set when the requester sent a reminder: when it started waiting on you. */
  reminderSince,
}) {
  const what = (kind || 'Request').toLowerCase();
  const subjectItem = item ? `: ${item}` : '';
  // Only multi-step requests have a step worth naming ("Finance/HR").
  const step = stageLabel && stageLabel !== 'Approver' ? stageLabel : '';
  return {
    // Name the thing in the subject line too. An approver triaging a full inbox
    // decides from the subject whether this is the one they were waiting on.
    subject: `${reminderSince ? 'Reminder: ' : ''}${kind || 'Request'} ${claimRef}${subjectItem} awaiting your approval`,
    html: layout({
      heading: reminderSince ? `Reminder: ${claimRef} is awaiting your approval` : `${claimRef} is awaiting your approval`,
      intro: reminderSince
        ? `${requester} is following up on this ${what}. It has been awaiting your approval since ${shortDate(reminderSince)}.`
        : `${requester} has submitted a ${what} for your approval.`,
      body: description,
      items,
      currency,
      rows: [
        ['Reference', claimRef],
        // The items table already names them on a requisition.
        ['Item', items?.length ? '' : item || ''],
        ['Requested by', requester || ''],
        ['Department', department || ''],
        ['Submitted', shortDate(submittedOn, true)],
        ['Your step', step],
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
        (hasAttachments ? 'Attachments are on the approval page. ' : '') +
        `This link works for ${ttlDays} days. After that, open Approvals at ${approvalsUrl()}`,
    }),
  };
}

/**
 * Tell the requester the outcome of a stage, or of the whole request.
 *
 * When it moves on, say who to and that they were emailed directly. Without
 * that, requesters forwarded this notice to the next approver, whose only link
 * was the requester's own "View my requests" (REQ-19).
 */
function decisionNotice({ kind, claimRef, item, decision, decidedBy, stageLabel, comment, complete, pdfUrl, nextApprover, remaining = [], route }) {
  const approved = decision === 'approved';
  const what = (kind || 'Request').toLowerCase();
  const moving = approved && !complete;
  // "Joseph Tay" or "Joseph Tay (Finance/HR), then Michael Ng (Final Approval)".
  const left = remaining.length
    ? remaining.map((r) => (r.stageLabel ? `${r.name} (${r.stageLabel})` : r.name)).join(', then ')
    : nextApprover || 'the next approver';
  return {
    subject: moving
      ? `${kind || 'Request'} ${claimRef} approved by ${decidedBy}, pending approval from ${remaining[0]?.name || nextApprover || 'the next approver'}`
      : `${kind || 'Request'} ${claimRef} has been ${decision}`,
    html: layout({
      heading: moving
        ? `${claimRef} approved by ${decidedBy}`
        : `${claimRef} has been ${decision}`,
      // Saying who has it now is what stops people forwarding this (REQ-19).
      intro: moving
        ? `Pending approval from ${left}.`
        : approved
          ? `Your ${what} has been fully approved.`
          : `${decidedBy} has rejected your ${what}.`,
      timeline: route,
      rows: [
        ['Reference', claimRef],
        ['Item', item],
        // The timeline already says who decided.
        [approved ? 'Approved by' : 'Rejected by', route ? '' : decidedBy],
        ['Comment', comment || ''],
      ],
      action:
        complete && approved && pdfUrl
          ? { href: pdfUrl, label: 'Open the signed PDF' }
          : { href: myRequestsUrl(), label: 'View my requests' },
    }),
  };
}

/* Tell a watcher, typically finance or HR, that a request cleared its last
 * approval. Separate from decisionNotice because that one is written to the
 * requester ("your claim is approved"), which reads wrong for a third party. */
function completionNotice({ kind, claimRef, item, requester, department, approvedBy, rows = [], items, currency, pdfUrl }) {
  return {
    subject: `${kind || 'Request'} ${claimRef} is fully approved`,
    html: layout({
      heading: `${kind || 'Request'} fully approved`,
      intro: 'All approvals are done.',
      items,
      currency,
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

/* Tell the approver whose turn it was that the requester withdrew it, so they
 * stop waiting on it and don't click a link that no longer resolves. */
function withdrawnNotice({ kind, claimRef, item, requester, stageLabel }) {
  return {
    subject: `${kind || 'Request'} ${claimRef} was withdrawn`,
    html: layout({
      heading: `This ${(kind || 'request').toLowerCase()} was withdrawn`,
      intro: `${requester} withdrew it. You don't need to do anything.`,
      rows: [
        ['Reference', claimRef],
        ['Item', item || ''],
        ['Requested by', requester || ''],
        ['You were', stageLabel || ''],
      ],
      footer: 'The link in the earlier email no longer works.',
    }),
  };
}

/** Confirm to the requester that their travel request was recorded. */
function travelReceipt({ claimRef, destination, dates, totalSGD, approverName }) {
  return {
    subject: `Your travel request ${claimRef} was recorded`,
    html: layout({
      heading: 'Travel request received',
      intro: "Here's your copy.",
      rows: [
        ['Reference', claimRef],
        ['Destination', destination || ''],
        ['Dates', dates || ''],
        ['Estimated cost', `SGD ${totalSGD}`],
        ['Sent to', approverName || ''],
      ],
      action: { href: myRequestsUrl(), label: 'View my requests' },
      footer: "It goes to your reporting manager, then Finance/HR, then final approval. You'll get an email after each decision.",
    }),
  };
}

/** Confirm to the requester that their requisition was recorded. */
function requisitionReceipt({ claimRef, item, totalSGD, approverName }) {
  return {
    subject: `Your purchase requisition ${claimRef} was recorded`,
    html: layout({
      heading: 'Requisition received',
      intro: "Here's your copy.",
      rows: [
        ['Reference', claimRef],
        ['Item', item],
        ['Estimated cost', `SGD ${totalSGD}`],
        ['Sent to', approverName],
      ],
      action: { href: myRequestsUrl(), label: 'View my requests' },
      footer: "You'll get an email after each decision.",
    }),
  };
}

module.exports = {
  sendMail,
  baseUrl,
  templates: {
    approvalRequest, requisitionReceipt, travelReceipt,
    decisionNotice, completionNotice, withdrawnNotice,
  },
};
