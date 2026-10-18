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

/** A selectable leave type, admin-managed in SharePoint, with code defaults as fallback. */
export interface LeaveTypeOption {
  name: string
}

export interface LeaveForm {
  department: string
  leaveType: string
  startDate: string // ISO yyyy-mm-dd
  endDate: string // ISO yyyy-mm-dd
  /** Applies to single-day requests: Full / AM (½) / PM (½). */
  portion: LeavePortion
  reason: string
  approverEmail: string
}

export interface LeaveErrors {
  department?: string
  leaveType?: string
  startDate?: string
  endDate?: string
  reason?: string
  approverEmail?: string
}

/** A selectable requisition item category, admin-managed in SharePoint, with code defaults as fallback. */
export interface RequisitionCategoryOption {
  name: string
}

/** Someone permitted to approve a requisition, admin-managed in SharePoint. */
export interface ApproverOption {
  name: string
  email: string
  stage: string
}

/** One line on a requisition. Every item shares the requisition's currency. */
export interface RequisitionItemForm {
  /** Stable React key; never sent to the server. */
  key: string
  category: string
  /** Free text, shown only when category is "Others". */
  categoryOther: string
  description: string
  quantity: number | string
  unitPrice: number | string
}

export type RequisitionItemErrors = Partial<
  Record<
    "category" | "categoryOther" | "description" | "quantity" | "unitPrice",
    string
  >
>

/** An item as stored and shown back, totals computed by the server. */
export interface RequisitionItem {
  category: string
  categoryOther: string
  description: string
  quantity: number
  /** Null on a several-item row saved before the LineItems column existed. */
  unitPrice: number | null
  total: number
}

export interface RequisitionForm {
  department: string
  jobTitle: string
  items: RequisitionItemForm[]
  currency: string
  vendorName: string
  vendorContact: string
  vendorEmail: string
  projectCustomer: string
  /** Stage 1 approver, mirrors "Reporting Manager" on the paper form. */
  reportingManager: string
  /** Stage 2 approver, mirrors "Final Approval" on the paper form. */
  finalApprover: string
}

export interface RequisitionErrors {
  department?: string
  jobTitle?: string
  reportingManager?: string
  finalApprover?: string
  /** Per item, by index. */
  items?: RequisitionItemErrors[]
  vendorName?: string
  vendorEmail?: string
  projectCustomer?: string
  quotation?: string
}

export interface TravelForm {
  department: string
  jobTitle: string
  purpose: string
  eventName: string
  destination: string
  travelFrom: string // ISO yyyy-mm-dd
  travelTo: string // ISO yyyy-mm-dd
  agenda: string
  /** Budget lines, all SGD. Held as strings so the inputs can be empty. */
  costFlight: string
  costHotel: string
  costEventFees: string
  costTransport: string
  costOther: string
  /** Names what "Other expenses" covers, mirrors the paper form's free line. */
  costOtherNote: string
  /** Three stages, all nominated by the requester. */
  reportingManager: string
  financeApprover: string
  finalApprover: string
}

export interface TravelErrors {
  department?: string
  jobTitle?: string
  purpose?: string
  destination?: string
  travelFrom?: string
  travelTo?: string
  agenda?: string
  budget?: string
  reportingManager?: string
  financeApprover?: string
  finalApprover?: string
}

/** What an approver is shown before signing, from GET /api/approval. */
export interface ApprovalView {
  claimRef: string
  /** "Purchase requisition", "Leave request", "Expense claim". */
  kind: string
  stage: number
  stageLabel: string
  /** Only requisitions ask for a drawn signature. */
  requiresSignature: boolean
  /** False when the link is spent, superseded, or the request already decided. */
  actionable: boolean
  reason: string
  status: string
  title: string
  description: string
  requester: string
  requesterEmail: string
  department: string
  submittedOn: string
  /** Label/value pairs rendered as the detail table. */
  rows: [string, string][]
  /** Requisitions only: the line items, priced in `currency`. */
  items?: RequisitionItem[]
  currency?: string
  /** Receipts, MCs or quotations filed against the request. */
  attachments: ApprovalAttachment[]
  /** Submitted, then each approver, for the progress timeline. */
  route?: RouteStep[]
}

export interface ApprovalAttachment {
  name: string
  size: number
  mimeType: string
  /** Pre-authenticated and short-lived; opens without SharePoint access. */
  url: string
  /** The library location, for anyone who does have access. */
  webUrl: string
}

export type Rates = Record<string, number>

export type RateStatus = "connecting" | "live" | "cached"

export interface SubmitResponse {
  itemId?: string
  claimRef?: string
  error?: string
}

export type RequestType = "expense" | "leave" | "requisition" | "travel"

/** A request waiting on the signed-in person, from GET /api/approval. */
export interface PendingApproval {
  ref: string
  type: RequestType
  /** "Purchase requisition", "Leave request", ... */
  kind: string
  title: string
  requester: string
  department: string
  submittedOn: string
  stageLabel: string
  /** "SGD 120.00", or "2 days" for leave. */
  figure: string
  /** The approver's step on multi-step requests ("Finance/HR"), else empty. */
  step: string
  /** When it reached the signed-in approver. */
  since: string
  /** Opens /approve?t=..., interchangeable with the emailed link. */
  token: string
}

/** One past submission of any type, as returned by GET /api/my-requests. */
export interface MyRequest {
  id: string
  ref: string
  type: RequestType
  date: string
  title: string
  detail: string
  /** null for leave, which has no money value, `meta` carries the days instead. */
  amountSGD: number | null
  meta: string
  status: string
  /** Set once a requisition is fully approved and its PDF has been composed. */
  pdfUrl?: string
  /** Who has it now. Null once decided, and always for expense claims. */
  /** Who has it now. `team` marks a group, like Finance for expense claims,
   *  which has no one to remind. `stageLabel` is empty for one-step requests. */
  waitingOn: { name: string; stageLabel: string; since: string; team?: boolean } | null
  /** When the requester last pressed Remind, if ever. */
  lastReminderAt: string | null
  /** No one has decided or approved it yet, so the requester may delete it. */
  canDelete: boolean
  /** Submitted, then each approver, for the progress timeline. */
  route: RouteStep[]
}

/** One step of a request's approval path, for the timeline. */
export interface RouteStep {
  /** "Submitted", "Approver", "Finance/HR", ... */
  label: string
  name: string
  status: "done" | "current" | "upcoming" | "rejected"
  date: string | null
}

/** Where a request stands, shown to someone who opened a link not meant for them. */
export interface NotYoursInfo {
  claimRef: string
  kind: string
  status: string
  isRequester: boolean
  withName: string | null
  withStage: string | null
  since: string | null
}
