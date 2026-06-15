import type { LeavePortion } from "./types"

/**
 * Leave days = weekdays (Mon–Fri) between start and end inclusive.
 * A single-day request can be a half-day (AM/PM = 0.5). Multi-day requests are
 * counted as full weekdays. (Public holidays are not excluded yet.)
 */
export function computeLeaveDays(
  start: string,
  end: string,
  portion: LeavePortion,
): number {
  if (!start || !end) return 0
  const s = new Date(start + "T00:00:00")
  const e = new Date(end + "T00:00:00")
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0

  let weekdays = 0
  const d = new Date(s)
  while (d <= e) {
    const g = d.getDay()
    if (g !== 0 && g !== 6) weekdays++
    d.setDate(d.getDate() + 1)
  }
  if (weekdays === 0) return 0
  if (start === end) return portion === "Full" ? 1 : 0.5
  return weekdays
}
