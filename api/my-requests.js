const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');

/* The three lists a person can have rows in, and how each one names things.
 * Requisitions use Requestor*; the older two use Employee*. */
const SOURCES = [
  {
    type:      'expense',
    listName:  () => process.env.SP_LIST_NAME,
    emailCol:  'EmployeeEmail',
    refPrefix: 'EXP',
    map: (f) => ({
      title:     f.Category || '',
      detail:    f.Description || '',
      amountSGD: f.TotalAmountSGD ?? 0,
      meta:      '',
    }),
  },
  {
    type:      'leave',
    listName:  () => process.env.SP_LEAVE_LIST_NAME || 'Leave Requests',
    emailCol:  'EmployeeEmail',
    refPrefix: 'LEAVE',
    map: (f) => {
      const days = Number(f.Days) || 0;
      return {
        title:     f.LeaveType || 'Leave',
        detail:    [f.StartDate, f.EndDate].filter(Boolean).map((d) => String(d).slice(0, 10)).join(' → '),
        amountSGD: null, // leave has no money, the UI shows `meta` instead
        meta:      days ? `${days} ${days === 1 ? 'day' : 'days'}` : '',
      };
    },
  },
  {
    type:      'requisition',
    listName:  () => process.env.SP_REQUISITION_LIST_NAME || 'Purchase Requisitions',
    emailCol:  'RequestorEmail',
    refPrefix: 'REQ',
    map: (f) => ({
      title:     f.ItemCategoryOther || f.ItemCategory || '',
      detail:    f.Description || '',
      amountSGD: f.EstimatedTotalSGD ?? 0,
      meta:      f.VendorName || '',
      // Only present once the final approval composed the signed document.
      pdfUrl:    f.ApprovedPdfUrl || '',
    }),
  },
];

/* Filter SERVER-SIDE on the verified email so a user can only ever see their
 * own rows, never anyone else's. */
async function listFor(token, siteId, source, email) {
  const listName = source.listName();
  if (!listName) return { items: [], warning: null };

  const safe = email.replace(/'/g, "''"); // escape single quotes for OData
  const url =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items` +
    `?$expand=fields&$top=200&$filter=fields/${source.emailCol} eq '${safe}'`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      // Allow filtering on a non-indexed column for modest list sizes. Index the
      // email column once a list nears 5,000 rows or this starts failing.
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  });

  if (!res.ok) {
    // One missing or unreadable list must not blank out the whole page, report
    // it alongside whatever else did load.
    const txt = await res.text();
    return { items: [], warning: `${source.type}: ${res.status} ${txt.slice(0, 200)}` };
  }
  return { items: (await res.json()).value || [], warning: null };
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyUserToken(req);
    if (!user.email)
      return res.status(400).json({ error: 'Token did not contain an email/username claim' });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);

    const results = await Promise.all(
      SOURCES.map((s) => listFor(token, siteId, s, user.email))
    );

    const requests = [];
    const warnings = [];

    results.forEach(({ items, warning }, i) => {
      if (warning) warnings.push(warning);
      const source = SOURCES[i];
      for (const it of items) {
        const f = it.fields || {};
        requests.push({
          id:     `${source.type}-${it.id}`,
          ref:    `${source.refPrefix}-${it.id}`,
          type:   source.type,
          date:   f.SubmissionDate || it.createdDateTime || '',
          status: f.Status || 'Pending',
          ...source.map(f),
        });
      }
    });

    // Newest first across all three types.
    requests.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.status(200).json({ requests, warnings });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[my-requests] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
