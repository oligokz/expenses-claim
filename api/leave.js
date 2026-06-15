const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

// Mirror of src/lib/leave.ts — recomputed server-side so the stored Days value
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

async function createLeaveItem(token, siteId, fields) {
  const listName = process.env.SP_LEAVE_LIST_NAME;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`createLeaveItem failed (${res.status}): ${txt}`);
  }
  return res.json();
}

// Same diagnostic as submit.js: report each field against its column type so a
// failed write tells us exactly which column is missing or mistyped.
async function describeColumns(token, siteId) {
  const listName = process.env.SP_LEAVE_LIST_NAME;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/columns`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const typeOf = (c) =>
    c.text ? 'text' : c.number ? 'number' : c.dateTime ? 'dateTime'
    : c.choice ? 'choice' : c.boolean ? 'boolean' : c.personOrGroup ? 'person'
    : c.calculated ? 'calculated(read-only)' : 'other';
  const map = {};
  for (const c of data.value || []) map[c.name] = typeOf(c) + (c.readOnly ? ' [readOnly]' : '');
  return map;
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.SP_LEAVE_LIST_NAME)
      return res.status(500).json({ error: 'SP_LEAVE_LIST_NAME is not configured' });

    const user = await verifyUserToken(req);
    if (!user.email)
      return res.status(400).json({ error: 'Token did not contain an email/username claim' });

    const {
      department, leaveType, startDate, endDate,
      startPortion = 'Full', endPortion = 'Full',
      reason, attachmentCount,
    } = req.body;

    if (!department || !leaveType || !startDate || !endDate)
      return res.status(400).json({ error: 'Missing required fields' });

    const days = computeDays(startDate, endDate, startPortion);
    if (days <= 0)
      return res.status(400).json({ error: 'Invalid date range (end before start, or no weekdays)' });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);

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
      AttachmentCount: attachmentCount || 0,
    };

    let created;
    try {
      created = await createLeaveItem(token, siteId, fields);
    } catch (writeErr) {
      const cols = await describeColumns(token, siteId).catch(() => null);
      if (cols) {
        writeErr.message +=
          ' | columns: ' + Object.keys(fields).map((f) => `${f}=${cols[f] || 'MISSING'}`).join(', ');
      }
      throw writeErr;
    }

    const itemId = created?.id || 'unknown';
    return res.status(200).json({ success: true, itemId, claimRef: `LEAVE-${itemId}`, days });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[leave] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
