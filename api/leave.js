const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { notifyApprover } = require('./_lib/notify');
const { assertApproversAllowed } = require('./_lib/approvers');
const { createListItem, withColumnReport } = require('./_lib/lists');
const { sendError } = require('./_lib/http');

// Mirror of src/lib/leave.ts, recomputed server-side so the stored Days value
// is trusted, not taken from the client.
function computeDays(start, end, portion) {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  let weekdays = 0;
  const d = new Date(s);
  while (d <= e) {
    const g = d.getDay();
    if (g !== 0 && g !== 6) weekdays++;
    d.setDate(d.getDate() + 1);
  }
  if (weekdays === 0) return 0;
  if (start === end) return portion === 'Full' ? 1 : 0.5;
  return weekdays;
}

const LIST = () => process.env.SP_LEAVE_LIST_NAME || 'Leave Requests';

module.exports = async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyUserToken(req);
    if (!user.email)
      return res.status(400).json({ error: 'Token did not contain an email/username claim' });

    const {
      department, leaveType, startDate, endDate,
      startPortion = 'Full', endPortion = 'Full',
      reason, approverEmail,
    } = req.body || {};

    if (!department || !leaveType || !startDate || !endDate)
      return res.status(400).json({ error: 'Missing required fields' });
    // Without an approver the request is saved but never reaches anyone.
    if (!String(approverEmail || '').trim())
      return res.status(400).json({ error: 'Select an approver' });

    const days = computeDays(startDate, endDate, startPortion);
    if (days <= 0)
      return res.status(400).json({ error: 'Invalid date range (end before start, or no weekdays)' });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    // The approver must come from the roster, and never be the requester.
    await assertApproversAllowed(token, siteId, user.email, [approverEmail]);

    const fields = {
      Title:          `${user.name} - ${leaveType} - ${startDate}`,
      EmployeeName:   user.name,
      EmployeeEmail:  user.email,
      Department:     department,
      LeaveType:      leaveType,
      StartDate:      startDate,
      EndDate:        endDate,
      StartPortion:   startPortion,
      EndPortion:     endPortion,
      Days:           days,
      Reason:         reason || '',
      Status:         'Pending',
      ApproverEmail:  approverEmail || '',
    };

    const created = await withColumnReport(token, siteId, LIST(), fields,
      () => createListItem(token, siteId, LIST(), fields));

    const itemId = created?.id || 'unknown';
    const { notified, mailError } = await notifyApprover(token, siteId, {
      moduleName: 'leave', itemId, approverEmail,
    });

    return res.status(200).json({
      success: true, itemId, claimRef: `LEAVE-${itemId}`, days, notified, mailError,
    });
  } catch (err) {
    return sendError(req, res, err, 'leave');
  }
};
