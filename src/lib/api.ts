import { getApiToken } from "./auth"
import type {
  LineRow,
  ClaimantForm,
  LeaveBalanceResponse,
  MyClaim,
  Rates,
  SubmitResponse,
} from "./types"
import { toSGD, num } from "./currency"

/** GET /api/rates — returns { rates } (1 SGD → currency). Throws on failure. */
export async function fetchRates(): Promise<Rates> {
  const r = await fetch("/api/rates")
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json()
  if (!d.rates) throw new Error("No rates in response")
  return { SGD: 1, ...d.rates }
}

/** GET /api/my-claims — the signed-in user's own past claims (newest first). */
export async function fetchMyClaims(): Promise<MyClaim[]> {
  const token = await getApiToken()
  const res = await fetch("/api/my-claims", {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to load your claims")
  return (data.claims as MyClaim[]) || []
}

interface SubmitArgs {
  claimant: ClaimantForm
  rows: LineRow[]
  notes: string
  receiptCount: number
  rates: Rates
}

/** POST /api/submit — creates the claim. Returns the new item id and claim reference. */
export async function submitClaim({
  claimant,
  rows,
  notes,
  receiptCount,
  rates,
}: SubmitArgs): Promise<{ itemId: string; claimRef: string }> {
  const token = await getApiToken()
  const lineItems = rows.map((r) => {
    const lineTotal = num(r.amt) * (num(r.qty) || 1)
    return {
      category: r.cat,
      description: r.desc,
      receiptDate: r.receiptDate,
      quantity: num(r.qty) || 1,
      currency: r.cur,
      amount: num(r.amt),
      lineTotal: parseFloat(lineTotal.toFixed(2)),
      amountSGD: parseFloat(toSGD(lineTotal, r.cur, rates).toFixed(2)),
    }
  })

  const res = await fetch("/api/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      employeeName: claimant.employee,
      employeeEmail: claimant.email,
      department: claimant.dept,
      submissionDate: claimant.subDate,
      lineItems,
      notes,
      receiptCount,
      exchangeRates: rates,
    }),
  })
  const data: SubmitResponse = await res.json()
  if (!res.ok) throw new Error(data.error || "Submit failed")
  return {
    itemId: (data.itemId as string) ?? "unknown",
    claimRef: data.claimRef ?? `EXP-${data.itemId ?? "unknown"}`,
  }
}

export interface UploadMeta {
  employeeName: string
  date: string
  claimRef: string
  index: number
}

/**
 * POST /api/upload — uploads one receipt.
 * Throws on failure so the caller can report per-receipt results honestly.
 * The claim itself is already submitted, so a failure here is recoverable (retry).
 */
export async function uploadReceipt(file: File, meta: UploadMeta): Promise<void> {
  const token = await getApiToken()
  const fd = new FormData()
  fd.append("metadata", JSON.stringify(meta))
  fd.append("file", file, file.name)
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  if (!res.ok) {
    const ud = await res.json().catch(() => ({}))
    throw new Error(ud.error || `Upload failed (HTTP ${res.status})`)
  }
}

interface LeaveArgs {
  leaveType: string
  startDate: string
  endDate: string
  startPortion: string
  endPortion: string
  days: number
  reason: string
  attachmentCount: number
}

/** POST /api/leave — creates a leave request. Returns the new id + ref. */
export async function submitLeave(
  args: LeaveArgs,
): Promise<{ itemId: string; claimRef: string }> {
  const token = await getApiToken()
  const res = await fetch("/api/leave", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Leave submit failed")
  return {
    itemId: (data.itemId as string) ?? "unknown",
    claimRef: data.claimRef ?? `LEAVE-${data.itemId ?? "unknown"}`,
  }
}

/** GET /api/leave-balance — the signed-in user's entitlements minus approved leave. */
export async function fetchLeaveBalance(): Promise<LeaveBalanceResponse> {
  const token = await getApiToken()
  const res = await fetch("/api/leave-balance", {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to load leave balance")
  return {
    balance: data.balance || {},
    hasEntitlements: !!data.hasEntitlements,
  }
}
