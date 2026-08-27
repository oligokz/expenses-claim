const { getAppToken, getSiteId, getDriveId, verifyUserToken, applyCors } = require('./_lib/sharepoint');
const { topFolderFor } = require('./_lib/attachments');

async function uploadFile(token, siteId, segments, buffer, mimeType) {
  const driveId = await getDriveId(token, siteId);
  // Graph auto-creates every folder in the path when uploading content.
  const path = segments.map(encodeURIComponent).join('/');
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${path}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType || 'application/octet-stream' },
      body: buffer,
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`uploadFile failed (${res.status}): ${txt}`);
  }
  return res.json();
}

function parseMultipart(buffer, boundary) {
  const sep = Buffer.from(`--${boundary}`);
  const parts = []; let start = 0;
  while (true) {
    const sepIdx = buffer.indexOf(sep, start);
    if (sepIdx === -1) break;
    const afterSep = sepIdx + sep.length;
    if (buffer.slice(afterSep, afterSep + 2).toString() === '--') break;
    const headerStart = afterSep + 2;
    const headerEnd   = buffer.indexOf('\r\n\r\n', headerStart);
    if (headerEnd === -1) break;
    const headers   = buffer.slice(headerStart, headerEnd).toString('utf8');
    const dataStart = headerEnd + 4;
    const nextSep   = buffer.indexOf(`\r\n${sep}`, dataStart);
    const dataEnd   = nextSep === -1 ? buffer.length : nextSep;
    parts.push({
      name:        headers.match(/name="([^"]+)"/)?.[1] || '',
      filename:    headers.match(/filename="([^"]+)"/)?.[1] || '',
      contentType: headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || '',
      data:        buffer.slice(dataStart, dataEnd),
    });
    start = dataStart;
  }
  return parts;
}

module.exports = async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Identity comes from the verified token, NOT the request metadata.
    const user = await verifyUserToken(req);

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody  = Buffer.concat(chunks);
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (!boundary) return res.status(400).json({ error: 'No boundary in content-type' });

    const parsed   = parseMultipart(rawBody, boundary);
    const metaPart = parsed.find(p => p.name === 'metadata');
    const filePart = parsed.find(p => p.name === 'file');
    if (!filePart) return res.status(400).json({ error: 'No file found in request' });
    if (!metaPart) return res.status(400).json({ error: 'No metadata found in request' });

    const meta = JSON.parse(metaPart.data.toString('utf8'));

    // Organise files as  <Type> / <YYYY-MM> / <REF> / NN-<file>
    //   Leave Attachments       / 2026-06 / LEAVE-5 / 01-mc.pdf
    //   Claims Attachments      / 2026-06 / EXP-12  / 01-receipt.pdf
    //   Requisition Attachments / 2026-06 / REQ-3   / 01-quotation.pdf
    //   Travel Attachments      / 2026-06 / TRV-7   / 01-flight-quote.pdf
    // so HR can copy a whole month's folder, with each item grouped inside.
    // Type is derived from the reference prefix; month from the item date.
    const ref = meta.claimRef || '';
    const topFolder   = topFolderFor(ref);
    const month       = /^\d{4}-\d{2}/.test(meta.date || '')
      ? meta.date.slice(0, 7)
      : 'Undated';
    const claimFolder = (ref || 'Unfiled').replace(/[^a-z0-9_-]/gi, '_');
    const idx         = Number.isInteger(meta.index) ? meta.index + 1 : 1;
    const safeFile    = (filePart.filename || 'receipt').replace(/[^a-z0-9._-]/gi, '_');
    const fileName    = `${String(idx).padStart(2, '0')}-${safeFile}`;
    const segments    = [topFolder, month, claimFolder, fileName];

    if (filePart.data.length > 15 * 1024 * 1024)
      return res.status(413).json({ error: 'File exceeds 15 MB limit' });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);
    await uploadFile(token, siteId, segments, filePart.data, filePart.contentType);
    return res.status(200).json({ success: true, fileName: segments.join('/') });

  } catch(err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[upload] ERROR:', err.message);
    return res.status(status).json({ error: err.message });
  }
};
