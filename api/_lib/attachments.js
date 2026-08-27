// Find the files uploaded against a request, so an approver can see what they
// are approving rather than taking the numbers on trust.
//
// upload.js files everything as  <Type>/<YYYY-MM>/<REF>/NN-<name>, where the
// month comes from whatever date that module happened to send: the submission
// date for expense and requisition, the start date for leave. Rather than
// re-deriving that rule and drifting from it, this tries the dates on the row
// first and falls back to scanning the month folders for the reference.

const { getDriveId } = require('./sharepoint');

/* The single source of truth for where a reference's files live. upload.js,
 * pdf.js and this module all route through it so the three cannot drift. */
const topFolderFor = (ref) =>
  /^LEAVE-/i.test(ref) ? 'Leave Attachments'
  : /^REQ-/i.test(ref) ? 'Requisition Attachments'
  : /^TRV-/i.test(ref) ? 'Travel Attachments'
  : 'Claims Attachments';

// upload.js sanitises the reference the same way when building the path.
const safeFolder = (ref) => (ref || 'Unfiled').replace(/[^a-z0-9_-]/gi, '_');

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

/** Children of a drive path, or null when the folder simply isn't there. */
async function children(token, driveId, path) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodePath(path)}:/children`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`list "${path}" failed (${res.status})`);
  return (await res.json()).value || [];
}

const describe = (item) => ({
  name: item.name,
  size: item.size ?? 0,
  mimeType: item.file?.mimeType || '',
  /* Pre-authenticated and short-lived (about an hour). It lets an approver open
   * a receipt without needing their own permission on the library, and it is
   * only ever handed to a request's verified approver. */
  url: item['@microsoft.graph.downloadUrl'] || item.webUrl || '',
  webUrl: item.webUrl || '',
});

/**
 * List a request's attachments. Never throws: an approver seeing no files is a
 * far better failure than an approval page that will not load.
 *
 * @param {string[]} dates  candidate dates off the row, any format, first wins
 */
async function listAttachments(token, siteId, claimRef, dates = []) {
  try {
    const driveId = await getDriveId(token, siteId);
    const top = topFolderFor(claimRef);
    const folder = safeFolder(claimRef);

    const months = [
      ...new Set(
        dates
          .filter(Boolean)
          .map((d) => String(d).slice(0, 7))
          .filter((m) => /^\d{4}-\d{2}$/.test(m))
      ),
    ];

    for (const month of months) {
      const found = await children(token, driveId, `${top}/${month}/${folder}`);
      if (found) return found.filter((i) => i.file).map(describe);
    }

    // The row's dates didn't locate it: the upload may have been filed under a
    // different month, or under 'Undated'. Walk the month folders instead.
    const monthDirs = await children(token, driveId, top);
    if (!monthDirs) return [];
    for (const dir of monthDirs) {
      if (!dir.folder || months.includes(dir.name)) continue;
      const found = await children(token, driveId, `${top}/${dir.name}/${folder}`);
      if (found) return found.filter((i) => i.file).map(describe);
    }
    return [];
  } catch (e) {
    console.error('[attachments] lookup failed:', e.message);
    return [];
  }
}

module.exports = { listAttachments, topFolderFor, safeFolder };
