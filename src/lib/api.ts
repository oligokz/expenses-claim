import { getApiToken } from "./auth"
import type {
  ApprovalView,
  ApproverOption,
  LineRow,
  ClaimantForm,
  LeaveTypeOption,
  MyRequest,
  NotYoursInfo,
  PendingApproval,
  Rates,
  RequestType,
  RequisitionCategoryOption,
} from "./types"
import {
  DEFAULT_LEAVE_TYPES,
  DEFAULT_REQUISITION_CATEGORIES,
  FALLBACK_RATES,
} from "./constants"
import { num } from "./currency"

/** An API failure, carrying the server's request id for support when it gave one. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(message)
  }
}

/**
 * Every call to our API goes through here: signs the request, reads the body
 * even when it isn't JSON (Vercel answers some failures with plain text), and
 * throws one readable message. For server errors it appends the request id
 * (`ref`) so a user can quote it; the logs that id points into are short-lived.
 */
async function call<T = Record<string, unknown>>(
  path: string,
  { method = "GET", json, form, fallback }: {
    method?: string
    json?: unknown
    form?: FormData
    /** Message when the server gives none. */
    fallback: string
  },
): Promise<T> {
  const token = await getApiToken()
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
  })
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    // Not JSON: a platform error page. Fall through to the fallback message.
  }
  if (!res.ok) {
    const message = typeof body.error === "string" ? body.error : fallback
    const ref = typeof body.ref === "string" && body.ref ? ` (ref ${body.ref})` : ""
    throw new ApiError(message + ref, res.status, body)
  }
  return body as T
}

/** GET /api/rates, returns { rates } (1 SGD → currency). Throws on failure. */
export async function fetchRates(): Promise<Rates> {
  const r = await fetch("/api/rates")
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json()
  if (!d.rates) throw new Error("No rates in response")
  // The live source skips some offered currencies (VND, TWD); without a rate
  // they would be counted as SGD, so the fallback table fills the gaps.
  return { ...FALLBACK_RATES, ...d.rates, SGD: 1 }
}

/**
 * GET /api/my-requests, the signed-in user's own submissions across every
 * module (newest first). `warnings` carries per-list failures so a single
 * unreadable list degrades one row group rather than the whole page.
 */
export async function fetchMyRequests(): Promise<{
  requests: MyRequest[]
  warnings: string[]
}> {
  const data = await call<{ requests?: MyRequest[]; warnings?: string[] }>(
    "/api/my-requests",
    { fallback: "Could not load your requests." },
  )
  return { requests: data.requests || [], warnings: data.warnings || [] }
}

interface SubmitArgs {
  claimant: ClaimantForm
  rows: LineRow[]
  notes: string
  receiptCount: number
}

/**
 * POST /api/submit, creates the claim. Identity, rates and the SGD total are
 * the server's own, so only what the person entered is sent; the returned
 * `totalSGD` is the figure actually saved.
 */
export async function submitClaim({
  claimant,
  rows,
  notes,
  receiptCount,
}: SubmitArgs): Promise<{ itemId: string; claimRef: string; totalSGD: number }> {
  const data = await call<{ itemId?: string; claimRef?: string; totalSGD?: number }>(
    "/api/submit",
    {
      method: "POST",
      fallback: "Could not submit the claim. Try again.",
      json: {
        department: claimant.dept,
        submissionDate: claimant.subDate,
        lineItems: rows.map((r) => ({
          category: r.cat,
          description: r.desc,
          receiptDate: r.receiptDate,
          quantity: num(r.qty) || 1,
          currency: r.cur,
          amount: num(r.amt),
        })),
        notes,
        receiptCount,
      },
    },
  )
  return {
    itemId: data.itemId ?? "unknown",
    claimRef: data.claimRef ?? `EXP-${data.itemId ?? "unknown"}`,
    totalSGD: data.totalSGD ?? 0,
  }
}

export interface UploadMeta {
  claimRef: string
  index: number
}

/**
 * POST /api/upload, uploads one receipt.
 * Throws on failure so the caller can report per-receipt results honestly.
 * The claim itself is already submitted, so a failure here is recoverable (retry).
 */
export async function uploadReceipt(file: File, meta: UploadMeta): Promise<void> {
  const form = new FormData()
  form.append("metadata", JSON.stringify(meta))
  form.append("file", file, file.name)
  await call("/api/upload", { method: "POST", form, fallback: "Could not upload the file." })
}

interface LeaveArgs {
  department: string
  leaveType: string
  startDate: string
  endDate: string
  startPortion: string
  endPortion: string
  reason: string
  approverEmail: string
}

/** POST /api/leave, creates a leave request. The server counts the days. */
export async function submitLeave(
  args: LeaveArgs,
): Promise<{ itemId: string; claimRef: string; days: number }> {
  const data = await call<{ itemId?: string; claimRef?: string; days?: number }>(
    "/api/leave",
    { method: "POST", json: args, fallback: "Could not submit the leave request. Try again." },
  )
  return {
    itemId: data.itemId ?? "unknown",
    claimRef: data.claimRef ?? `LEAVE-${data.itemId ?? "unknown"}`,
    days: data.days ?? 0,
  }
}

/**
 * GET /api/leave-types, admin-managed leave types from SharePoint.
 * Falls back to the built-in defaults if the list isn't configured yet.
 */
export async function fetchLeaveTypes(): Promise<LeaveTypeOption[]> {
  try {
    const data = await call<{ types?: LeaveTypeOption[] }>("/api/leave-types", {
      fallback: "Could not load leave types.",
    })
    return data.types?.length ? data.types : DEFAULT_LEAVE_TYPES
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

  const query = stage === "all" ? "" : `?stage=${stage}`
  const request = call<{ approvers?: ApproverOption[] }>(`/api/approvers${query}`, {
    fallback: "Could not load approvers.",
  })
    .then((d) => d.approvers || [])
    .catch((e) => {
      approverCache.delete(stage)
      throw e
    })

  approverCache.set(stage, request)
  return request
}

/**
 * GET /api/approval with no token, everything waiting on the signed-in person,
 * oldest first. `warnings` names any list that couldn't be read.
 */
export async function fetchMyApprovals(): Promise<{
  approvals: PendingApproval[]
  warnings: string[]
}> {
  const data = await call<{ approvals?: PendingApproval[]; warnings?: string[] }>(
    "/api/approval",
    { fallback: "Could not load your approvals." },
  )
  return { approvals: data.approvals || [], warnings: data.warnings || [] }
}

/** Thrown when the signed-in person isn't this link's approver (a forwarded email). */
export class NotYoursError extends Error {
  constructor(
    message: string,
    public info: NotYoursInfo,
  ) {
    super(message)
  }
}

/** GET /api/approval, what this approver is being asked to sign. */
export async function fetchApproval(token: string): Promise<ApprovalView> {
  try {
    return await call<ApprovalView>(`/api/approval?t=${encodeURIComponent(token)}`, {
      fallback: "Could not load this approval.",
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 403 && e.body.notYours) {
      throw new NotYoursError(e.message, e.body.notYours as NotYoursInfo)
    }
    throw e
  }
}

/**
 * POST /api/approval {action: "remind"}, re-email whoever has one of your
 * requests. Limited to one per request per day; the server enforces it.
 */
export async function remindApprover(
  type: RequestType,
  itemId: string,
): Promise<{ sentTo: string; nextAllowed: string }> {
  return call<{ sentTo: string; nextAllowed: string }>("/api/approval", {
    method: "POST",
    json: { action: "remind", type, itemId },
    fallback: "Could not send the reminder.",
  })
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
  return call("/api/approval", {
    method: "POST",
    json: args,
    fallback: "Could not record your decision.",
  })
}

interface RequisitionArgs {
  department: string
  jobTitle: string
  items: {
    category: string
    categoryOther: string
    description: string
    quantity: number
    unitPrice: number
  }[]
  currency: string
  vendorName: string
  vendorContact: string
  vendorEmail: string
  projectCustomer: string
  reportingManager: string
  finalApprover: string
  quotationAttached: boolean
}

/**
 * POST /api/cancel, deletes one of your own requests.
 *
 * A real delete: the row leaves the SharePoint list and its attachments go with
 * it, both into the site recycle bin. The server re-checks ownership and that
 * no one has approved it, so this cannot remove anyone else's row or a record.
 */
export async function deleteRequest(
  type: RequestType,
  itemId: string,
): Promise<{ claimRef: string; notified: boolean }> {
  const data = await call<{ claimRef?: string; notified?: boolean }>("/api/cancel", {
    method: "POST",
    json: { type, itemId },
    fallback: "Could not delete the request.",
  })
  return { claimRef: data.claimRef ?? "", notified: !!data.notified }
}

export interface TravelArgs {
  department: string
  jobTitle: string
  purpose: string
  eventName: string
  destination: string
  travelFrom: string
  travelTo: string
  agenda: string
  costFlight: number
  costHotel: number
  costEventFees: number
  costTransport: number
  costOther: number
  costOtherNote: string
  reportingManager: string
  financeApprover: string
  finalApprover: string
}

/** POST /api/travel, creates a travel request. Returns the new id + ref. */
export async function submitTravel(args: TravelArgs): Promise<{
  itemId: string
  claimRef: string
  totalSGD: number
  /** True only if the first approver was actually emailed. */
  notified: boolean
}> {
  const data = await call<{ itemId?: string; claimRef?: string; totalSGD?: number; notified?: boolean }>(
    "/api/travel",
    { method: "POST", json: args, fallback: "Could not submit the travel request. Try again." },
  )
  return {
    itemId: data.itemId ?? "unknown",
    claimRef: data.claimRef ?? `TRV-${data.itemId ?? "unknown"}`,
    totalSGD: data.totalSGD ?? 0,
    notified: !!data.notified,
  }
}

/** POST /api/requisition, creates a purchase requisition. Returns the new id + ref. */
export async function submitRequisition(args: RequisitionArgs): Promise<{
  itemId: string
  claimRef: string
  estimatedTotalSGD: number
  /** True only if the approver was actually emailed. */
  notified: boolean
}> {
  const data = await call<{ itemId?: string; claimRef?: string; estimatedTotalSGD?: number; notified?: boolean }>(
    "/api/requisition",
    { method: "POST", json: args, fallback: "Could not submit the requisition. Try again." },
  )
  return {
    itemId: data.itemId ?? "unknown",
    claimRef: data.claimRef ?? `REQ-${data.itemId ?? "unknown"}`,
    estimatedTotalSGD: data.estimatedTotalSGD ?? 0,
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
    const data = await call<{ categories?: RequisitionCategoryOption[] }>(
      "/api/requisition-categories",
      { fallback: "Could not load categories." },
    )
    return data.categories?.length ? data.categories : DEFAULT_REQUISITION_CATEGORIES
  } catch {
    return DEFAULT_REQUISITION_CATEGORIES
  }
}
