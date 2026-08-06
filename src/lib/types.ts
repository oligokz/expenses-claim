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

/** A selectable leave type — admin-managed in SharePoint, with code defaults as fallback. */
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
}

export interface LeaveErrors {
  department?: string
  leaveType?: string
  startDate?: string
  endDate?: string
  reason?: string
}

/** A selectable requisition item category — admin-managed in SharePoint, with code defaults as fallback. */
export interface RequisitionCategoryOption {
  name: string
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
  /** Optional routing hint for whoever runs the approval — see PurchaseRequisition. */
  reportingManager: string
}

export interface RequisitionErrors {
  department?: string
  jobTitle?: string
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
