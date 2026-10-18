const { getAppToken, getSiteId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { sendError } = require('./_lib/http');
const { itemsFromRow, itemsTitle } = require('./_lib/requisitionItems');
const { getModule, waitingOn, buildRoute } = require('./_lib/approvals');
const { listApprovers } = require('./_lib/approvers');

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
    type:      'travel',
    listName:  () => process.env.SP_TRAVEL_LIST_NAME || 'Travel Requests',
    emailCol:  'RequestorEmail',
    refPrefix: 'TRV',
    map: (f) => ({
      title:     f.Destination ? `Travel to ${f.Destination}` : 'Travel request',
      detail:    f.PurposeOfTravel || '',
      amountSGD: f.TotalEstimatedSGD ?? 0,
      meta:      [f.TravelFrom, f.TravelTo]
        .filter(Boolean)
        .map((d) => String(d).slice(0, 10))
        .join(' → '),
      pdfUrl:    f.ApprovedPdfUrl || '',
    }),
  },
  {
    type:      'requisition',
    listName:  () => process.env.SP_REQUISITION_LIST_NAME || 'Purchase Requisitions',
    emailCol:  'RequestorEmail',
    refPrefix: 'REQ',
    map: (f) => ({
      title:     itemsTitle(itemsFromRow(f)),
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
  let url =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items` +
    `?$expand=fields&$top=200&$filter=${encodeURIComponent(`fields/${source.emailCol} eq '${safe}'`)}`;

  // Follow Graph's paging so someone with more than one page of requests still
  // sees all of them. Bounded, so a runaway list can't hang the function.
  const items = [];
  for (let page = 0; url && page < 10; page++) {
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
      console.error(`[my-requests] ${source.type} list failed (${res.status}):`, (await res.text()).slice(0, 300));
      return { items, warning: `Your ${source.type} requests could not be loaded just now.` };
    }
    const data = await res.json();
    items.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return { items, warning: null };
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

    const [results, roster] = await Promise.all([
      Promise.all(SOURCES.map((s) => listFor(token, siteId, s, user.email))),
      // Display names for "waiting on". Unreadable just means emails are shown.
      listApprovers(token, siteId, { includeInactive: true }).catch(() => null),
    ]);
    const nameOf = (email) =>
      roster?.find((a) => a.email.toLowerCase() === email.toLowerCase())?.name || email;

    const requests = [];
    const warnings = [];

    results.forEach(({ items, warning }, i) => {
      if (warning) warnings.push(warning);
      const source = SOURCES[i];
      for (const it of items) {
        const f = it.fields || {};
        /* Who has it now, so a requester can see where it is instead of
         * guessing and forwarding emails (REQ-19). Expense claims have no
         * approver in the app, so they never show one. */
        const waiting = waitingOn(getModule(source.type), f);
        requests.push({
          id:     `${source.type}-${it.id}`,
          ref:    `${source.refPrefix}-${it.id}`,
          type:   source.type,
          date:   f.SubmissionDate || it.createdDateTime || '',
          status: f.Status || 'Pending',
          ...source.map(f),
          waitingOn: waiting && waiting.email
            ? {
                name: nameOf(waiting.email),
                // Only worth naming the step when there is more than one.
                stageLabel: getModule(source.type).stages.length > 1 ? waiting.stage.label : '',
                since: waiting.since || it.createdDateTime || '',
              }
            : source.type === 'expense' && (f.Status || 'Pending') === 'Pending'
              // Expense claims have no approver in the app; Finance processes them.
              ? { name: 'Finance', stageLabel: '', since: '', team: true }
              : null,
          lastReminderAt: f.LastReminderAt || null,
          route: buildRoute(getModule(source.type), f, nameOf),
        });
      }
    });

    // Newest first across all three types.
    requests.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.status(200).json({ requests, warnings });
  } catch (err) {
    return sendError(req, res, err, 'my-requests');
  }
};
