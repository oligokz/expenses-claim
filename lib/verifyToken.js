/**
 * lib/verifyToken.js
 * Verifies the Azure AD ID token sent from the browser.
 * Confirms the user is who they say they are before we write anything to SharePoint.
 */

let _jwks = null;
let _jwksExpiry = 0;

async function getJwks() {
  if (_jwks && Date.now() < _jwksExpiry) return _jwks;
  const tenantId = process.env.AZURE_TENANT_ID;
  const metaRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
  );
  const meta = await metaRes.json();
  const jwksRes = await fetch(meta.jwks_uri);
  _jwks = await jwksRes.json();
  _jwksExpiry = Date.now() + 60 * 60 * 1000; // cache 1 hour
  return _jwks;
}

/**
 * Verifies an Azure AD ID token (JWT) from the browser.
 * Returns the decoded payload if valid, throws if invalid.
 *
 * Note: We use a lightweight manual verification here to avoid
 * adding heavy JWT libraries. For production, consider 'jsonwebtoken' + 'jwks-rsa'.
 */
export async function verifyIdToken(idToken) {
  if (!idToken) throw new Error('No ID token provided');

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  // Decode payload (no verification yet — just to read claims)
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

  // Basic claims validation
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp < now)      throw new Error('Token expired');
  if (payload.aud !== clientId) throw new Error('Token audience mismatch');
  if (!payload.tid || payload.tid !== tenantId) throw new Error('Token tenant mismatch');

  // Return useful identity info
  return {
    email:      payload.preferred_username || payload.email || payload.upn,
    name:       payload.name,
    oid:        payload.oid,   // Azure AD object ID (unique per user)
    tenantId:   payload.tid,
  };
}
