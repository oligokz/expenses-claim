import type { Rates } from "./types"

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
