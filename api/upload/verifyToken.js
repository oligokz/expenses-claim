let _jwks = null, _jwksExpiry = 0;

async function verifyIdToken(idToken) {
  if (!idToken) throw new Error('No ID token provided');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now)          throw new Error('Token expired');
  if (payload.aud !== clientId)   throw new Error('Token audience mismatch');
  if (payload.tid !== tenantId)   throw new Error('Token tenant mismatch');
  return {
    email:    payload.preferred_username || payload.email || payload.upn,
    name:     payload.name,
    oid:      payload.oid,
    tenantId: payload.tid,
  };
}

module.exports = { verifyIdToken };
