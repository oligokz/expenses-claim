// Shared helpers for the /api functions.
// Vercel ignores files under api/ whose path segment starts with "_",
// so this is NOT exposed as a route, it's importable by submit.js / upload.js.

let _cachedToken = null, _tokenExpiry = 0, _siteId = null, _driveId = null;
let _jwks = null;

/* ── App-only token (client credentials), used for the actual Graph writes ── */
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

async function getDriveId(token, siteId) {
  if (_driveId) return _driveId;
  const libName   = process.env.SP_LIBRARY_NAME;
  const drivesRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!drivesRes.ok) throw new Error(`getDrives failed: ${drivesRes.status}`);
  const drives = await drivesRes.json();
  const drive  = drives.value.find(d => d.name === libName);
  if (!drive) throw new Error(`Drive "${libName}" not found. Available: ${drives.value.map(d => d.name).join(', ')}`);
  _driveId = drive.id;
  return _driveId;
}

/* ── User token verification, proves WHO is submitting ──
 * Validates the bearer token the SPA obtained via MSAL against the tenant's
 * public keys (JWKS). Checks signature, issuer, audience, expiry, and that the
 * required scope is present. Returns the verified identity on success; throws
 * an Error carrying .status = 401 on any failure so handlers can map it.
 */
async function getJwks() {
  if (_jwks) return _jwks;
  const { createRemoteJWKSet } = await import('jose');
  _jwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`)
  );
  return _jwks;
}

function unauthorized(msg) {
  const e = new Error(msg);
  e.status = 401;
  return e;
}

async function verifyUserToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match  = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw unauthorized('Missing or malformed Authorization header');
  const token = match[1];

  const { jwtVerify } = await import('jose');
  const jwks     = await getJwks();
  const tenant      = process.env.AZURE_TENANT_ID;
  const spaClientId = process.env.SPA_CLIENT_ID;
  const audience = [
    process.env.API_AUDIENCE,                       // api://<spa-client-id>
    spaClientId,                                     // bare GUID (some v2 tokens)
    spaClientId ? `api://${spaClientId}` : null,     // derived App ID URI (v1 tokens)
  ].filter(Boolean);

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      // Accept both Entra token formats for this tenant:
      //   v2.0 → https://login.microsoftonline.com/<tenant>/v2.0
      //   v1.0 → https://sts.windows.net/<tenant>/
      issuer: [
        `https://login.microsoftonline.com/${tenant}/v2.0`,
        `https://sts.windows.net/${tenant}/`,
      ],
      audience,
    }));
  } catch (err) {
    throw unauthorized(`Invalid token: ${err.message}`);
  }

  // Require our scope so a token minted for a *different* API can't be replayed here.
  const scopes = (payload.scp || '').split(' ').filter(Boolean);
  if (!scopes.includes('access_as_user'))
    throw unauthorized('Token missing required scope access_as_user');

  const email = payload.preferred_username || payload.email || payload.upn || '';
  const name  = payload.name || email || 'Unknown';
  return { name, email, claims: payload };
}

/* ── CORS, explicit origin allowlist (no wildcard) ──
 * ALLOWED_ORIGINS is a comma-separated env var, e.g.
 *   "http://localhost:3000,https://your-app.vercel.app"
 * Echoes the request origin back only if it's on the list.
 */
function applyCors(req, res, methods) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = {
  getAppToken, getSiteId, getDriveId,
  verifyUserToken, applyCors,
};
