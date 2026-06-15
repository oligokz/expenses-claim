export interface LineRow {
  id: number
  cat: string
  desc: string
  receiptDate: string // ISO yyyy-mm-dd
  qty: number | string
  cur: string
  amt: number | string
}

export interface ClaimantForm {
  employee: string
  email: string
  dept: string
  subDate: string // ISO yyyy-mm-dd
}

/** Per-field validation messages, keyed by the field that failed. */
export interface FormErrors {
  employee?: string
  dept?: string
  subDate?: string
  cat?: string
  receiptDate?: string
  amt?: string
}

export type LeavePortion = "Full" | "AM" | "PM"

export interface LeaveForm {
  leaveType: string
  startDate: string // ISO yyyy-mm-dd
  endDate: string // ISO yyyy-mm-dd
  /** Applies to single-day requests: Full / AM (½) / PM (½). */
  portion: LeavePortion
  reason: string
}

export interface LeaveErrors {
  leaveType?: string
  startDate?: string
  endDate?: string
  reason?: string
}

export interface LeaveBalanceEntry {
  entitlement: number
  taken: number
  remaining: number
}

/** Keyed by balanceKey: annual / medical / compassionate. */
export type LeaveBalance = Record<string, LeaveBalanceEntry>

export interface LeaveBalanceResponse {
  balance: LeaveBalance
  hasEntitlements: boolean
}

export type Rates = Record<string, number>

export type RateStatus = "connecting" | "live" | "cached"

export interface SubmitResponse {
  itemId?: string
  claimRef?: string
  error?: string
}

/** A past expense claim, as returned by GET /api/my-claims. */
export interface MyClaim {
  id: string
  claimRef: string
  submissionDate: string
  category: string
  description: string
  amount: number
  currency: string
  totalSGD: number
  status: string
  department: string
}
