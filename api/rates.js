/**
 * api/rates.js
 * Proxies the exchange rate request server-side to avoid CORS.
 * Browser calls /api/rates instead of frankfurter.app directly.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=SGD', {
      headers: { 'Accept': 'application/json' }
    });
    if (!r.ok) throw new Error(`Frankfurter returned ${r.status}`);
    const data = await r.json();
    // Cache for 1 hour on Vercel's CDN edge
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch(err) {
    console.error('[rates]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
