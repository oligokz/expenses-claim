// All SharePoint logic is inlined here — Vercel serverless functions
// cannot require files outside the /api directory without a build step.

let _cachedToken = null, _tokenExpiry = 0, _siteId = null, _driveId = null;

async function getAppToken() {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;
  const url  = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  _cachedToken = data.access_token;
  _tokenExpiry = now + (data.expires_in - 300) * 1000;
  return _cachedToken;
}

async function getSiteId(token) {
  if (_siteId) return _siteId;
  const spUrl    = process.env.SP_SITE_URL;
  const hostname = new URL(spUrl).hostname;
  const sitePath = new URL(spUrl).pathname;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`getSiteId failed (${res.status}): ${txt}`);
  }
  _siteId = (await res.json()).id;
  return _siteId;
}

async function uploadFile(token, siteId, fileName, buffer, mimeType) {
  if (!_driveId) {
    const libName   = process.env.SP_LIBRARY_NAME;
    const drivesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!drivesRes.ok) throw new Error(`getDrives failed: ${drivesRes.status}`);
    const drives = await drivesRes.json();
    const drive  = drives.value.find(d => d.name === libName);
    if (!drive) throw new Error(`Drive "${libName}" not found. Available: ${drives.value.map(d=>d.name).join(', ')}`);
    _driveId = drive.id;
  }
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${_driveId}/root:/${encodeURIComponent(fileName)}:/content`,
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
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

    const meta     = JSON.parse(metaPart.data.toString('utf8'));
    const safeName = (meta.employeeName || 'unknown').replace(/[^a-z0-9]/gi, '_');
    const fileName = `${safeName}_${meta.date}_${filePart.filename}`;

    if (filePart.data.length > 15 * 1024 * 1024)
      return res.status(413).json({ error: 'File exceeds 15 MB limit' });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);
    await uploadFile(token, siteId, fileName, filePart.data, filePart.contentType);
    return res.status(200).json({ success: true, fileName });

  } catch(err) {
    console.error('[upload] ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
