const { getAppToken, getSiteId, uploadFile } = require('../lib/sharepoint');

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
    if (!boundary) return res.status(400).json({ error: 'No boundary' });

    const parsed   = parseMultipart(rawBody, boundary);
    const metaPart = parsed.find(p => p.name === 'metadata');
    const filePart = parsed.find(p => p.name === 'file');
    if (!filePart) return res.status(400).json({ error: 'No file' });
    if (!metaPart) return res.status(400).json({ error: 'No metadata' });

    const meta     = JSON.parse(metaPart.data.toString('utf8'));
    const fileName = `${(meta.employeeName||'unknown').replace(/[^a-z0-9]/gi,'_')}_${meta.date}_${filePart.filename}`;

    if (filePart.data.length > 15 * 1024 * 1024)
      return res.status(413).json({ error: 'File exceeds 15 MB' });

    const token  = await getAppToken();
    const siteId = await getSiteId(token);
    await uploadFile(token, siteId, fileName, filePart.data, filePart.contentType);
    return res.status(200).json({ success: true, fileName });

  } catch(err) {
    console.error('[upload]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

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
