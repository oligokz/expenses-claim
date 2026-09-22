// The approver roster, and the server-side rules for who a requester may name.
//
// The browser only offers names from this list, but the API used to store
// whatever approver email it was sent, so a crafted request could name the
// requester themselves, or any colleague, and then approve it. These checks
// run on every submit instead.

/* Who may approve, from the "Requisition Approvers" SharePoint list, so the set
 * is bounded and editable without a redeploy.
 * Columns: Title (display name), ApproverEmail, ApprovalStage
 * ('Reporting Manager' | 'Final Approval' | 'Both'), Department (blank = all),
 * Active (yes/no), SortOrder (number).
 *
 * Returns null when the list can't be read, so callers can tell "nobody is
 * configured" apart from "we couldn't check".
 */
async function listApprovers(token, siteId) {
  const listName = process.env.SP_REQAPPROVERS_LIST_NAME || 'Requisition Approvers';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?$expand=fields&$top=500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const rows = ((await res.json()).value || []).map((i) => i.fields || {});
  return rows
    .filter((f) => f.Active !== false) // treat missing Active as active
    .filter((f) => f.ApproverEmail)
    .sort((a, b) => (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0))
    .map((f) => ({
      name:       f.Title || f.ApproverEmail,
      email:      f.ApproverEmail,
      stage:      f.ApprovalStage || 'Reporting Manager',
      department: f.Department || '',
    }));
}

const norm = (s) => String(s || '').trim().toLowerCase();

function reject(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

/**
 * Throw a 400 unless every nominated approver is allowed.
 *
 *  - Nobody may nominate themselves. ALLOW_SELF_APPROVAL=true switches this
 *    off, for testing with a one-person roster only.
 *  - When the roster has entries, every nominee must be on it. When it is
 *    empty or unreadable, the form falls back to free text, so any address is
 *    accepted, as before.
 *
 * @param {string[]} emails  the approvers named on the request; blanks ignored
 */
async function assertApproversAllowed(token, siteId, requesterEmail, emails) {
  const named = emails.map(norm).filter(Boolean);
  if (!named.length) return;

  if (process.env.ALLOW_SELF_APPROVAL !== 'true' && named.includes(norm(requesterEmail))) {
    throw reject('You cannot nominate yourself as an approver.');
  }

  const roster = await listApprovers(token, siteId);
  if (!roster || roster.length === 0) return;
  const allowed = new Set(roster.map((a) => norm(a.email)));
  const stranger = named.find((e) => !allowed.has(e));
  if (stranger) {
    throw reject(`${stranger} is not on the approvers list. Pick an approver from the list.`);
  }
}

module.exports = { listApprovers, assertApproversAllowed };
