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
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status} — ${await res.text()}`);
  const data = await res.json();
  _cachedToken = data.access_token;
  _tokenExpiry = now + (data.expires_in - 300) * 1000;
  return _cachedToken;
}

async function getSiteId(token) {
  if (_siteId) return _siteId;
  const spUrl   = process.env.SP_SITE_URL;
  const hostname = new URL(spUrl).hostname;
  const sitePath = new URL(spUrl).pathname;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`getSiteId failed: ${res.status}`);
  _siteId = (await res.json()).id;
  return _siteId;
}

async function createListItem(token, siteId, fields) {
  const listName = process.env.SP_LIST_NAME;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) throw new Error(`createListItem failed: ${res.status} — ${await res.text()}`);
  return res.json();
}

async function uploadFile(token, siteId, fileName, buffer, mimeType) {
  if (!_driveId) {
    const libName  = process.env.SP_LIBRARY_NAME;
    const drivesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!drivesRes.ok) throw new Error(`getDrives failed: ${drivesRes.status}`);
    const drives = await drivesRes.json();
    const drive  = drives.value.find(d => d.name === libName);
    if (!drive) throw new Error(`Drive "${libName}" not found`);
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
  if (!res.ok) throw new Error(`uploadFile failed: ${res.status} — ${await res.text()}`);
  return res.json();
}

module.exports = { getAppToken, getSiteId, createListItem, uploadFile };
