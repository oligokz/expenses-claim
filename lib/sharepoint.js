/**
 * lib/sharepoint.js
 * Server-side only. Gets an app-level token using client credentials flow
 * and provides helpers for writing to SharePoint.
 * This file is NEVER sent to the browser.
 */

const SP_SITE   = process.env.SP_SITE_URL;
const LIST_NAME = process.env.SP_LIST_NAME;
const LIB_NAME  = process.env.SP_LIBRARY_NAME;
const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

let _cachedToken = null;
let _tokenExpiry  = 0;

/**
 * Gets an app-only access token for SharePoint using client credentials.
 * Caches it until 5 minutes before expiry.
 */
export async function getAppToken() {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token fetch failed: ${res.status} — ${err}`);
  }

  const data = await res.json();
  _cachedToken = data.access_token;
  // cache until 5 min before actual expiry
  _tokenExpiry = now + (data.expires_in - 300) * 1000;
  return _cachedToken;
}

/**
 * Gets the SharePoint site ID via Microsoft Graph.
 * Used to build Graph API URLs for list/library operations.
 */
let _siteId = null;
export async function getSiteId(token) {
  if (_siteId) return _siteId;
  // e.g. creoxtech.sharepoint.com:/sites/Forms
  const hostname = new URL(SP_SITE).hostname;
  const sitePath = new URL(SP_SITE).pathname;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`getSiteId failed: ${res.status}`);
  const data = await res.json();
  _siteId = data.id;
  return _siteId;
}

/**
 * Writes a new list item to the ExpenseClaims list.
 */
export async function createListItem(token, siteId, fields) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(LIST_NAME)}/items`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`createListItem failed: ${res.status} — ${err}`);
  }
  return res.json();
}

/**
 * Uploads a file buffer to the Receipts document library.
 */
export async function uploadFile(token, siteId, fileName, buffer, mimeType) {
  // Get drive ID for the library
  const drivesRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!drivesRes.ok) throw new Error(`getDrives failed: ${drivesRes.status}`);
  const drives = await drivesRes.json();
  const drive = drives.value.find(d => d.name === LIB_NAME);
  if (!drive) throw new Error(`Drive "${LIB_NAME}" not found`);

  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${drive.id}/root:/${encodeURIComponent(fileName)}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: buffer,
    }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`uploadFile failed: ${uploadRes.status} — ${err}`);
  }
  return uploadRes.json();
}
