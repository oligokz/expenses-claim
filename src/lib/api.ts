import { getApiToken } from "./auth"
import type {
  ApprovalView,
  ApproverOption,
  LineRow,
  ClaimantForm,
  LeaveTypeOption,
  MyRequest,
  Rates,
  RequisitionCategoryOption,
  SubmitResponse,
} from "./types"
import {
  DEFAULT_LEAVE_TYPES,
  DEFAULT_REQUISITION_CATEGORIES,
} from "./constants"
import { toSGD, num } from "./currency"

/** GET /api/rates, returns { rates } (1 SGD → currency). Throws on failure. */
export async function fetchRates(): Promise<Rates> {
  const r = await fetch("/api/rates")
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json()
  if (!d.rates) throw new Error("No rates in response")
  return { SGD: 1, ...d.rates }
}

/**
 * GET /api/my-requests, the signed-in user's own submissions across all three
 * modules (newest first). `warnings` carries per-list failures so a single
 * unreadable list degrades one row group rather than the whole page.
 */
export async function fetchMyRequests(): Promise<{
  requests: MyRequest[]
  warnings: string[]
}> {
  const token = await getApiToken()
  const res = await fetch("/api/my-requests", {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Failed to load your requests")
  return {
    requests: (data.requests as MyRequest[]) || [],
    warnings: (data.warnings as string[]) || [],
  }
}

interface SubmitArgs {
  claimant: ClaimantForm
  rows: LineRow[]
  notes: string
  receiptCount: number
  rates: Rates
}

/** POST /api/submit, creates the claim. Returns the new item id and claim reference. */
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
 * POST /api/upload, uploads one receipt.
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
  department: string
  leaveType: string
  startDate: string
  endDate: string
  startPortion: string
  endPortion: string
  days: number
  reason: string
  approverEmail: string
}

/** POST /api/leave, creates a leave request. Returns the new id + ref. */
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

/**
 * GET /api/leave-types, admin-managed leave types from SharePoint.
 * Falls back to the built-in defaults if the list isn't configured yet.
 */
export async function fetchLeaveTypes(): Promise<LeaveTypeOption[]> {
  try {
    const token = await getApiToken()
    const res = await fetch("/api/leave-types", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    const types = (data.types as LeaveTypeOption[]) || []
    return types.length ? types : DEFAULT_LEAVE_TYPES
  } catch {
    return DEFAULT_LEAVE_TYPES
  }
}

/**
 * GET /api/approvers, who may approve, from SharePoint.
 * `stage` is "reporting" (stage 1) or "final" (stage 2); those marked Both
 * appear for either. Returns [] if the list isn't set up yet, which the form
 * treats as "fall back to typing an address".
 */
/* Cached for the session. Switching tabs remounts the forms, and refetching
 * each time made the approver field visibly flip from its fallback to the
 * dropdown on every switch. Failures are not cached, so they retry. */
const approverCache = new Map<string, Promise<ApproverOption[]>>()

export async function fetchApprovers(
  stage: "reporting" | "final" | "all",
): Promise<ApproverOption[]> {
  const hit = approverCache.get(stage)
  if (hit) return hit

  const request = (async () => {
    const token = await getApiToken()
    const query = stage === "all" ? "" : `?stage=${stage}`
    const res = await fetch(`/api/approvers${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to load approvers")
    return (data.approvers as ApproverOption[]) || []
  })().catch((e) => {
    approverCache.delete(stage)
    throw e
  })

  approverCache.set(stage, request)
  return request
}

/** GET /api/approval, what this approver is being asked to sign. */
export async function fetchApproval(token: string): Promise<ApprovalView> {
  const apiToken = await getApiToken()
  const res = await fetch(`/api/approval?t=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Could not load this approval")
  return data as ApprovalView
}

/** POST /api/approval, record an approve or reject decision. */
export async function submitApproval(args: {
  token: string
  decision: "approve" | "reject"
  comment: string
  /** PNG data URL; omitted on rejection. */
  signature?: string
}): Promise<{
  decision: string
  claimRef: string
  complete?: boolean
  nextApprover?: string | null
  /** Present once the final approval composes the signed document. */
  pdfUrl?: string | null
}> {
  const apiToken = await getApiToken()
  const res = await fetch("/api/approval", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(args),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Could not record your decision")
  return data
}

interface RequisitionArgs {
  department: string
  jobTitle: string
  itemCategory: string
  itemCategoryOther: string
  description: string
  quantity: number
  unitPrice: number
  currency: string
  vendorName: string
  vendorContact: string
  vendorEmail: string
  projectCustomer: string
  reportingManager: string
  finalApprover: string
  quotationAttached: boolean
  exchangeRates: Rates
}

/** POST /api/requisition, creates a purchase requisition. Returns the new id + ref. */
export async function submitRequisition(args: RequisitionArgs): Promise<{
  itemId: string
  claimRef: string
  estimatedTotalSGD: number
  /** True only if the approver was actually emailed. */
  notified: boolean
}> {
  const token = await getApiToken()
  const res = await fetch("/api/requisition", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Requisition submit failed")
  if (data.mailError) {
    // The requisition saved; only the notification failed. Worth seeing in the
    // console, but not worth failing the submission over.
    console.warn("Requisition saved but notification failed:", data.mailError)
  }
  return {
    itemId: (data.itemId as string) ?? "unknown",
    claimRef: data.claimRef ?? `REQ-${data.itemId ?? "unknown"}`,
    estimatedTotalSGD: (data.estimatedTotalSGD as number) ?? 0,
    notified: !!data.notified,
  }
}

/**
 * GET /api/requisition-categories, admin-managed item categories from SharePoint.
 * Falls back to the built-in defaults if the list isn't configured yet.
 */
export async function fetchRequisitionCategories(): Promise<
  RequisitionCategoryOption[]
> {
  try {
    const token = await getApiToken()
    const res = await fetch("/api/requisition-categories", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    const categories = (data.categories as RequisitionCategoryOption[]) || []
    return categories.length ? categories : DEFAULT_REQUISITION_CATEGORIES
  } catch {
    return DEFAULT_REQUISITION_CATEGORIES
  }
}
