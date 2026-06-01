/**
 * pages/api/upload.js
 *
 * POST /api/upload
 * Accepts a single file upload (multipart/form-data), verifies the user's
 * identity, then uploads the file to the SharePoint Receipts library using
 * app-level credentials.
 */

import { verifyIdToken }                      from '../../lib/verifyToken';
import { getAppToken, getSiteId, uploadFile } from '../../lib/sharepoint';

// Disable Next.js default body parser — we need raw multipart
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verify identity
    const authHeader = req.headers.authorization || '';
    const idToken    = authHeader.replace('Bearer ', '').trim();
    const user       = await verifyIdToken(idToken);

    // 2. Parse multipart body manually using raw chunks
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody    = Buffer.concat(chunks);
    const boundary   = req.headers['content-type']?.split('boundary=')[1];

    if (!boundary) return res.status(400).json({ error: 'No boundary in content-type' });

    // Parse the two parts: metadata (JSON) and file (binary)
    const parsed     = parseMultipart(rawBody, boundary);
    const metaPart   = parsed.find(p => p.name === 'metadata');
    const filePart   = parsed.find(p => p.name === 'file');

    if (!filePart)  return res.status(400).json({ error: 'No file in request' });
    if (!metaPart)  return res.status(400).json({ error: 'No metadata in request' });

    const meta       = JSON.parse(metaPart.data.toString('utf8'));
    const fileName   = `${meta.employeeName.replace(/[^a-z0-9]/gi,'_')}_${meta.date}_${filePart.filename}`;
    const mimeType   = filePart.contentType || 'application/octet-stream';

    // File size check (15 MB max)
    if (filePart.data.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: `File exceeds 15 MB limit: ${filePart.filename}` });
    }

    // 3. Upload via app token
    const token  = await getAppToken();
    const siteId = await getSiteId(token);
    await uploadFile(token, siteId, fileName, filePart.data, mimeType);

    return res.status(200).json({ success: true, fileName });

  } catch (err) {
    console.error('[upload] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Minimal multipart/form-data parser.
 * Returns array of { name, filename, contentType, data }
 */
function parseMultipart(buffer, boundary) {
  const sep    = Buffer.from(`--${boundary}`);
  const parts  = [];
  let   start  = 0;

  while (true) {
    const sepIdx = buffer.indexOf(sep, start);
    if (sepIdx === -1) break;
    const afterSep = sepIdx + sep.length;
    // Check for final boundary
    if (buffer.slice(afterSep, afterSep + 2).toString() === '--') break;
    // Skip CRLF after boundary
    const headerStart = afterSep + 2;
    const headerEnd   = buffer.indexOf('\r\n\r\n', headerStart);
    if (headerEnd === -1) break;

    const headers    = buffer.slice(headerStart, headerEnd).toString('utf8');
    const dataStart  = headerEnd + 4;
    const nextSep    = buffer.indexOf(`\r\n${sep}`, dataStart);
    const dataEnd    = nextSep === -1 ? buffer.length : nextSep;
    const data       = buffer.slice(dataStart, dataEnd);

    const nameMatch  = headers.match(/name="([^"]+)"/);
    const fileMatch  = headers.match(/filename="([^"]+)"/);
    const ctMatch    = headers.match(/Content-Type:\s*([^\r\n]+)/i);

    parts.push({
      name:        nameMatch?.[1] || '',
      filename:    fileMatch?.[1] || '',
      contentType: ctMatch?.[1]?.trim() || '',
      data,
    });
    start = dataStart;
  }
  return parts;
}
