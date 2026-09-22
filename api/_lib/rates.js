// Exchange rates, fetched server-side so stored money is never computed from
// figures the browser supplied.
//
// Rates are "1 SGD → X", the shape Frankfurter returns with from=SGD. Frankfurter
// (ECB data) doesn't publish every currency the forms offer, VND and TWD among
// them, so FALLBACK fills the gaps. It must stay in step with FALLBACK_RATES in
// src/lib/constants.ts, which the browser uses for the same purpose.

const FALLBACK = {
  SGD: 1,
  USD: 0.74,
  EUR: 0.69,
  GBP: 0.59,
  JPY: 111,
  CNY: 5.38,
  MYR: 3.42,
  AUD: 1.13,
  NZD: 1.21,
  THB: 26.9,
  HKD: 5.8,
  IDR: 11700,
  PHP: 42.5,
  VND: 18500,
  INR: 61.8,
  KRW: 990,
  TWD: 23.8,
  CHF: 0.66,
  CAD: 1.01,
  SEK: 7.9,
};

const SOURCE = 'https://api.frankfurter.dev/v1/latest?from=SGD';
const TTL_MS = 10 * 60 * 1000;

// Survives between invocations on a warm function instance, nothing more.
let cache = { at: 0, rates: null };

/** Live rates merged over the fallback table. Throws only if the fetch fails. */
async function fetchLive() {
  const r = await fetch(SOURCE, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Frankfurter returned ${r.status}`);
  const data = await r.json();
  if (!data || !data.rates) throw new Error('No rates in response');
  return { ...FALLBACK, ...data.rates, SGD: 1 };
}

/**
 * Current rates. Never throws: if the live source is down, the fallback table
 * is used, the same trade the browser makes.
 */
async function getRates() {
  if (cache.rates && Date.now() - cache.at < TTL_MS) return cache.rates;
  try {
    const rates = await fetchLive();
    cache = { at: Date.now(), rates };
    return rates;
  } catch (e) {
    console.error('[rates] live fetch failed, using fallback:', e.message);
    return cache.rates || { ...FALLBACK };
  }
}

/**
 * Convert to SGD, rounded to cents. Returns null for a currency with no rate,
 * so the caller can refuse it rather than silently treating it as SGD.
 */
function toSGD(amount, currency, rates) {
  const n = Number(amount) || 0;
  if (!currency || currency === 'SGD') return Math.round(n * 100) / 100;
  const rate = Number(rates[currency]);
  if (!rate || !isFinite(rate) || rate <= 0) return null;
  return Math.round((n / rate) * 100) / 100;
}

module.exports = { getRates, fetchLive, toSGD, FALLBACK };
