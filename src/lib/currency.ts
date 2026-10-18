import type { Rates } from "./types"
import { BIG_UNIT_CURRENCIES } from "./constants"

/**
 * A rate the way a receipt is read: "1 USD = 1.3412 SGD". Rates are stored as
 * 1 SGD -> currency, and small-unit currencies are quoted per 1,000 so the
 * figure isn't 0.0001.
 */
export function rateInSGD(currency: string, rates: Rates): { units: string; sgd: string } | null {
  const r = rates[currency]
  if (!r) return null
  const per = BIG_UNIT_CURRENCIES.has(currency) ? 1000 : 1
  return { units: `${per.toLocaleString("en-SG")} ${currency}`, sgd: fmt(per / r, 4) }
}

/** Convert an amount in currency `c` to SGD using `rates` (1 SGD → c). */
export function toSGD(amount: number, currency: string, rates: Rates): number {
  if (!currency || currency === "SGD") return amount
  const r = rates[currency]
  return r ? amount / r : amount
}

/** Format a number with grouping and fixed decimals (en-SG). */
export function fmt(n: number | string, dec = 2): string {
  return (parseFloat(String(n)) || 0).toLocaleString("en-SG", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

export const num = (v: number | string): number => parseFloat(String(v)) || 0
