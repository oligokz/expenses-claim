/**
 * api/rates.js
 * Proxies the exchange rate request server-side to avoid CORS.
 * Browser calls /api/rates instead of frankfurter directly.
 *
 * Returns the live rates merged over the fallback table, so a currency the
 * live source doesn't publish (VND, TWD) still has a rate rather than being
 * treated as SGD.
 */
const { applyCors } = require('./_lib/sharepoint');
const { fetchLive } = require('./_lib/rates');

module.exports = async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rates = await fetchLive();
    // Cache for 1 hour on Vercel's CDN edge
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ base: 'SGD', rates });
  } catch(err) {
    console.error('[rates]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
