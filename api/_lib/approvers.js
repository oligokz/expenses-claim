// The approver roster, and the server-side rules for who a requester may name.
//
// The browser only offers names from this list, but the API used to store
// whatever approver email it was sent, so a crafted request could name the
// requester themselves, or any colleague, and then approve it. These checks
// run on every submit instead.

const { httpError } = require('./http');

/* Who may approve, from the "Requisition Approvers" SharePoint list, so the set
 * is bounded and editable without a redeploy.
 * Columns: Title (display name), ApproverEmail, ApprovalStage
 * ('Reporting Manager' | 'Final Approval' | 'Both'), Department (blank = all),
 * Active (yes/no), SortOrder (number).
 *
 * Returns null when the list can't be read, so callers can tell "nobody is
 * configured" apart from "we couldn't check".
 */
async function listApprovers(token, siteId, { includeInactive = false } = {}) {
  const listName = process.env.SP_REQAPPROVERS_LIST_NAME || 'Requisition Approvers';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?$expand=fields&$top=500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const rows = ((await res.json()).value || []).map((i) => i.fields || {});
  return rows
    // Missing Active counts as active. Inactive people can't be picked, but
    // name lookups still want them: requests already sent to them show a name.
    .filter((f) => includeInactive || f.Active !== false)
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

/** Does a roster entry cover `stage`? 'Both' covers either; no stage means any. */
const coversStage = (entry, stage) =>
  !stage || entry.stage === stage || entry.stage === 'Both';

/**
 * Throw a 400 unless every nominated approver is allowed.
 *
 *  - Nobody may nominate themselves. ALLOW_SELF_APPROVAL=true switches this
 *    off, for testing with a one-person roster only.
 *  - When the roster has entries, every nominee must be on it, and where a
 *    stage is given ('Reporting Manager' or 'Final Approval'), marked for that
 *    stage or 'Both'. When the roster is empty the form falls back to free
 *    text, so any address is accepted.
 *  - When the roster can't be read at all, the request is refused (503)
 *    rather than waved through: a throttled Graph call must not become a way
 *    to name someone outside the list.
 *
 * @param {Array<string|{email: string, stage?: string}>} nominees
 *   the approvers named on the request; blanks ignored
 */
async function assertApproversAllowed(token, siteId, requesterEmail, nominees) {
  const named = nominees
    .map((n) => (typeof n === 'string' ? { email: n } : n))
    .map((n) => ({ email: norm(n.email), stage: n.stage || null }))
    .filter((n) => n.email);
  if (!named.length) return;

  if (process.env.ALLOW_SELF_APPROVAL !== 'true' && named.some((n) => n.email === norm(requesterEmail))) {
    throw httpError(400, 'You cannot nominate yourself as an approver.');
  }

  const roster = await listApprovers(token, siteId);
  if (!roster) {
    throw httpError(503, 'We could not check the approvers list just now. Please try again in a minute.');
  }
  if (roster.length === 0) return;

  for (const n of named) {
    const entries = roster.filter((a) => norm(a.email) === n.email);
    if (!entries.length) {
      throw httpError(400, `${n.email} is not on the approvers list. Pick an approver from the list.`);
    }
    if (!entries.some((a) => coversStage(a, n.stage))) {
      throw httpError(400, `${n.email} cannot approve at the ${n.stage.toLowerCase()} stage. Pick someone from that stage's list.`);
    }
  }
}

/** An approver's display name from the roster, falling back to the email. */
async function approverName(token, siteId, email) {
  if (!email) return '';
  try {
    const roster = await listApprovers(token, siteId, { includeInactive: true });
    return roster?.find((a) => norm(a.email) === norm(email))?.name || email;
  } catch {
    return email;
  }
}

/**
 * A synchronous email-to-name function, built from one read of the roster, for
 * pages that name several approvers at once. Falls back to the email.
 */
async function nameLookup(token, siteId) {
  const roster = await listApprovers(token, siteId, { includeInactive: true }).catch(() => null);
  return (email) => roster?.find((a) => norm(a.email) === norm(email))?.name || email;
}

module.exports = { listApprovers, assertApproversAllowed, approverName, nameLookup };
