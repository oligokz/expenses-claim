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
  department: string
}

export interface RequisitionForm {
  department: string
  jobTitle: string
  itemCategory: string
  /** Free text, shown only when itemCategory is "Others". */
  itemCategoryOther: string
  description: string
  quantity: number | string
  unitPrice: number | string
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
  itemCategory?: string
  itemCategoryOther?: string
  description?: string
  quantity?: string
  unitPrice?: string
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
  /** Receipts, MCs or quotations filed against the request. */
  attachments: ApprovalAttachment[]
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
}
