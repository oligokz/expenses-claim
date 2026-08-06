import { useEffect, useMemo, useState } from "react"
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Loader2,
  Lock,
  Package,
  Plus,
  Send,
  User,
} from "lucide-react"
import { toast } from "sonner"

import { SectionCard } from "@/components/SectionCard"
import { FieldError } from "@/components/FieldError"
import { FieldLabel } from "@/components/FieldLabel"
import { Receipts } from "@/components/Receipts"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  fetchApprovers,
  fetchRequisitionCategories,
  submitRequisition,
  uploadReceipt,
} from "@/lib/api"
import {
  ALL_CURRENCIES,
  DEPARTMENTS,
  REQUISITION_OTHER,
} from "@/lib/constants"
import { fmt, num, toSGD } from "@/lib/currency"
import type {
  ApproverOption,
  Rates,
  RequisitionCategoryOption,
  RequisitionErrors,
  RequisitionForm,
} from "@/lib/types"

/** Radix Select can't hold an empty string as a value, so "none" needs a token. */
const NONE = "__none__"

const blankForm = (): RequisitionForm => ({
  department: "",
  jobTitle: "",
  itemCategory: "",
  itemCategoryOther: "",
  description: "",
  quantity: 1,
  unitPrice: "",
  currency: "SGD",
  vendorName: "",
  vendorContact: "",
  vendorEmail: "",
  projectCustomer: "",
  reportingManager: "",
  finalApprover: "",
})

/** DOM ids for required controls, in document order — used to focus the first invalid field. */
const FIELD_IDS: Partial<Record<keyof RequisitionErrors, string>> = {
  department: "req-dept",
  reportingManager: "req-manager",
  finalApprover: "req-final-approver",
  itemCategory: "req-cat",
  itemCategoryOther: "req-cat-other",
  description: "req-desc",
  quantity: "req-qty",
  unitPrice: "req-price",
  vendorName: "req-vendor",
  vendorEmail: "req-vendor-email",
  projectCustomer: "req-project",
}
const FIELD_ORDER: (keyof RequisitionErrors)[] = [
  "department",
  "reportingManager",
  "finalApprover",
  "itemCategory",
  "itemCategoryOther",
  "description",
  "quantity",
  "unitPrice",
  "vendorName",
  "vendorEmail",
  "projectCustomer",
  "quotation",
]

export function PurchaseRequisition({
  employeeName,
  rates,
}: {
  employeeName: string
  rates: Rates
}) {
  const [form, setForm] = useState<RequisitionForm>(blankForm)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<RequisitionErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [categories, setCategories] = useState<RequisitionCategoryOption[]>([])
  const [approvers, setApprovers] = useState<ApproverOption[]>([])
  const [finalApprovers, setFinalApprovers] = useState<ApproverOption[]>([])
  const [submitted, setSubmitted] = useState<{
    ref: string
    totalSGD: number
    attachments: number
    notified: boolean
  } | null>(null)

  useEffect(() => {
    let alive = true
    fetchRequisitionCategories().then((c) => {
      if (alive) setCategories(c)
    })
    fetchApprovers("reporting").then((a) => {
      if (alive) setApprovers(a)
    })
    fetchApprovers("final").then((a) => {
      if (alive) setFinalApprovers(a)
    })
    return () => {
      alive = false
    }
  }, [])

  const update = <K extends keyof RequisitionForm>(
    field: K,
    val: RequisitionForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: val }))
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as keyof RequisitionErrors]
      return next
    })
  }

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const accepted: File[] = []
    Array.from(list).forEach((f) => {
      if (f.size > 15 * 1024 * 1024) toast.error(`${f.name}: exceeds 15 MB`)
      else accepted.push(f)
    })
    if (accepted.length) {
      setFiles((prev) => [...prev, ...accepted])
      setErrors((prev) => {
        if (!prev.quotation) return prev
        const next = { ...prev }
        delete next.quotation
        return next
      })
    }
  }
  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i))

  const showOther = form.itemCategory === REQUISITION_OTHER

  /* Estimated total — quantity × unit price, converted for the committed figure. */
  const { estimatedTotal, estimatedTotalSGD, hasAmount } = useMemo(() => {
    const total = num(form.quantity) * num(form.unitPrice)
    return {
      estimatedTotal: total,
      estimatedTotalSGD: toSGD(total, form.currency, rates),
      hasAmount: total > 0,
    }
  }, [form.quantity, form.unitPrice, form.currency, rates])

  const handleSubmit = async () => {
    const found: RequisitionErrors = {}
    if (!form.department) found.department = "Select a department"
    // Only required once there's a list to pick from — otherwise the free-text
    // fallback stays optional, as it was before.
    if (approvers.length > 0 && !form.reportingManager)
      found.reportingManager = "Select the approver"
    // Optional on purpose: leaving it blank makes stage 1 the final approval,
    // which is the single-stage shape leave and expense will want.
    /* Two stages signed by one person is one stage wearing a hat — but only
       complain when there's actually an alternative to choose. While a single
       approver is configured, insisting on two distinct people would make the
       flow impossible rather than safer. */
    const sameBoth =
      form.reportingManager &&
      form.finalApprover &&
      form.reportingManager.toLowerCase() === form.finalApprover.toLowerCase()
    const hasAlternative = finalApprovers.some(
      (a) => a.email.toLowerCase() !== form.reportingManager.toLowerCase(),
    )
    if (sameBoth && hasAlternative) {
      found.finalApprover = "Pick someone other than the first approver"
    }
    if (!form.itemCategory) found.itemCategory = "Select an item category"
    if (showOther && !form.itemCategoryOther.trim())
      found.itemCategoryOther = "Describe the category"
    if (!form.description.trim())
      found.description = "Describe the item or service"
    if (num(form.quantity) <= 0) found.quantity = "Enter a quantity"
    if (num(form.unitPrice) <= 0) found.unitPrice = "Enter the unit price"
    if (!form.vendorName.trim()) found.vendorName = "Enter the vendor name"
    if (form.vendorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.vendorEmail))
      found.vendorEmail = "Enter a valid email address"
    if (!form.projectCustomer.trim())
      found.projectCustomer = "Name the project or customer"
    // The paper form marks the vendor quotation as required, so we enforce it
    // as a real attachment rather than a checkbox the requester can just tick.
    if (files.length === 0) found.quotation = "Attach the vendor quotation"

    if (Object.keys(found).length > 0) {
      setErrors(found)
      toast.error("Please complete the highlighted fields")
      const firstInvalid = FIELD_ORDER.find((f) => found[f])
      const focusId = firstInvalid ? FIELD_IDS[firstInvalid] : undefined
      if (focusId) {
        window.requestAnimationFrame(() => {
          document.getElementById(focusId)?.focus()
        })
      }
      return
    }
    setErrors({})

    setSubmitting(true)
    try {
      const { claimRef, estimatedTotalSGD: committedSGD, notified } =
        await submitRequisition({
          department: form.department,
          jobTitle: form.jobTitle,
          itemCategory: form.itemCategory,
          itemCategoryOther: showOther ? form.itemCategoryOther : "",
          description: form.description,
          quantity: num(form.quantity),
          unitPrice: num(form.unitPrice),
          currency: form.currency,
          vendorName: form.vendorName,
          vendorContact: form.vendorContact,
          vendorEmail: form.vendorEmail,
          projectCustomer: form.projectCustomer,
          reportingManager: form.reportingManager,
          finalApprover: form.finalApprover,
          quotationAttached: files.length > 0,
          exchangeRates: rates,
        })

      let failed = 0
      const today = new Date().toISOString().slice(0, 10)
      for (let i = 0; i < files.length; i++) {
        try {
          await uploadReceipt(files[i], {
            employeeName,
            date: today,
            claimRef,
            index: i,
          })
        } catch (e) {
          console.warn(
            `Quotation "${files[i].name}" failed:`,
            (e as Error).message,
          )
          failed++
        }
      }

      if (failed > 0)
        toast.warning(
          `Requisition submitted (${claimRef}) — ${failed} attachment(s) need a retry`,
        )
      else toast.success(`Requisition submitted (${claimRef})`)

      setSubmitted({
        ref: claimRef,
        totalSGD: committedSGD,
        attachments: files.length - failed,
        notified,
      })
      setForm(blankForm())
      setFiles([])
    } catch (e) {
      console.error(e)
      toast.error(`Error: ${(e as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <Card className="mx-auto max-w-md gap-0 overflow-hidden p-6 text-center sm:p-7">
        <div className="flex flex-col items-center">
          <span className="grid size-12 place-items-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">
            Requisition submitted
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SGD {fmt(submitted.totalSGD)} · {submitted.attachments} attachment
            {submitted.attachments === 1 ? "" : "s"} ·{" "}
            {/* Only claim the approver was told if the email actually sent. */}
            {submitted.notified
              ? "your approver has been emailed."
              : "recorded and awaiting review."}
          </p>
          <div className="mt-5 w-full rounded-xl bg-surface-dark px-5 py-4 text-surface-dark-foreground">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-dark-muted">
              Reference
            </div>
            <div className="mt-1 font-mono text-xl font-bold tabular-nums">
              {submitted.ref}
            </div>
          </div>
        </div>
        <Button
          size="lg"
          className="mt-6 h-12 w-full text-sm font-semibold"
          onClick={() => setSubmitted(null)}
        >
          <Plus className="size-4" />
          New requisition
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Purchase Requisition
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request a direct purchase for approval.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {/* ── Requestor ── */}
        <SectionCard icon={<User />} title="Requestor Information">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="req-employee" text="Name" required />
              <div className="relative">
                <Input
                  id="req-employee"
                  value={employeeName}
                  readOnly
                  aria-required="true"
                  className="bg-muted pr-9"
                />
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel id="req-dept-label" text="Department" required />
              <Select
                value={form.department || undefined}
                onValueChange={(v) => update("department", v)}
              >
                <SelectTrigger
                  id="req-dept"
                  className="w-full bg-card"
                  aria-labelledby="req-dept-label"
                  aria-required="true"
                  aria-invalid={!!errors.department || undefined}
                >
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="req-dept-error" message={errors.department} />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="req-job-title" text="Job Title" />
              <Input
                id="req-job-title"
                value={form.jobTitle}
                onChange={(e) => update("jobTitle", e.target.value)}
                placeholder="e.g. Systems Engineer"
                className="bg-card"
              />
            </div>

            {/* Approvers come from a bounded SharePoint list. If it can't be
                read we fall back to a free-text address rather than blocking
                the whole form on it. */}
            <div className="flex flex-col gap-1.5">
              {approvers.length > 0 ? (
                <>
                  <FieldLabel
                    id="req-manager-label"
                    text="First approver"
                    required
                  />
                  <Select
                    value={form.reportingManager || undefined}
                    onValueChange={(v) => update("reportingManager", v)}
                  >
                    <SelectTrigger
                      id="req-manager"
                      className="w-full bg-card"
                      aria-labelledby="req-manager-label"
                      aria-required="true"
                      aria-invalid={!!errors.reportingManager || undefined}
                    >
                      <SelectValue placeholder="Select approver" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvers.map((a) => (
                        <SelectItem key={a.email} value={a.email}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <FieldLabel
                    htmlFor="req-manager"
                    text="First approver (email)"
                  />
                  <Input
                    id="req-manager"
                    type="email"
                    value={form.reportingManager}
                    onChange={(e) => update("reportingManager", e.target.value)}
                    placeholder="Optional — who should approve this"
                    className="bg-card"
                  />
                </>
              )}
              <FieldError
                id="req-manager-error"
                message={errors.reportingManager}
              />
            </div>

            {/* Stage 2. Both approvers are chosen up front so the whole route is
                visible before submitting, rather than the second one appearing
                out of a config the requester can't see. */}
            <div className="flex flex-col gap-1.5">
              {finalApprovers.length > 0 ? (
                <>
                  <FieldLabel
                    id="req-final-approver-label"
                    text="Second approver (optional)"
                  />
                  <Select
                    value={form.finalApprover || undefined}
                    onValueChange={(v) =>
                      update("finalApprover", v === NONE ? "" : v)
                    }
                  >
                    <SelectTrigger
                      id="req-final-approver"
                      className="w-full bg-card"
                      aria-labelledby="req-final-approver-label"
                      aria-invalid={!!errors.finalApprover || undefined}
                    >
                      <SelectValue placeholder="No second approval needed" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No second approval</SelectItem>
                      {finalApprovers.map((a) => (
                        <SelectItem key={a.email} value={a.email}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <FieldLabel
                    htmlFor="req-final-approver"
                    text="Second approver (email, optional)"
                  />
                  <Input
                    id="req-final-approver"
                    type="email"
                    value={form.finalApprover}
                    onChange={(e) => update("finalApprover", e.target.value)}
                    placeholder="Optional — second approval"
                    className="bg-card"
                  />
                </>
              )}
              <FieldError
                id="req-final-approver-error"
                message={errors.finalApprover}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── Item / service ── */}
        <SectionCard icon={<Package />} title="Item / Service Details">
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel id="req-cat-label" text="Item category" required />
                <Select
                  value={form.itemCategory || undefined}
                  onValueChange={(v) => update("itemCategory", v)}
                >
                  <SelectTrigger
                    id="req-cat"
                    className="w-full bg-card"
                    aria-labelledby="req-cat-label"
                    aria-required="true"
                    aria-invalid={!!errors.itemCategory || undefined}
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="req-cat-error" message={errors.itemCategory} />
              </div>

              {showOther && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="req-cat-other" text="If others" required />
                  <Input
                    id="req-cat-other"
                    value={form.itemCategoryOther}
                    onChange={(e) => update("itemCategoryOther", e.target.value)}
                    aria-required="true"
                    aria-invalid={!!errors.itemCategoryOther || undefined}
                    placeholder="Specify the category"
                    className="bg-card"
                  />
                  <FieldError
                    id="req-cat-other-error"
                    message={errors.itemCategoryOther}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="req-desc"
                text="Description of item / service"
                required
              />
              <Textarea
                id="req-desc"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.description || undefined}
                placeholder="Model, specification, part number, or scope of work"
                className="min-h-24 resize-y bg-card"
              />
              <FieldError id="req-desc-error" message={errors.description} />
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="req-qty" text="Quantity" required />
                <Input
                  id="req-qty"
                  type="number"
                  min={1}
                  step="1"
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(e) => update("quantity", e.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.quantity || undefined}
                  className="bg-card tabular-nums"
                />
                <FieldError id="req-qty-error" message={errors.quantity} />
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel id="req-cur-label" text="Currency" />
                <Select
                  value={form.currency}
                  onValueChange={(v) => update("currency", v)}
                >
                  <SelectTrigger
                    id="req-cur"
                    className="w-full bg-card"
                    aria-labelledby="req-cur-label"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="req-price" text="Unit price" required />
                <Input
                  id="req-price"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.unitPrice}
                  onChange={(e) => update("unitPrice", e.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.unitPrice || undefined}
                  placeholder="0.00"
                  className="bg-card tabular-nums"
                />
                <FieldError id="req-price-error" message={errors.unitPrice} />
              </div>
            </div>

            {/* Committed figure — the requester sees the converted total before submitting. */}
            <div className="flex items-center justify-between rounded-xl border bg-muted/50 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">
                  Estimated total cost
                </div>
                {hasAmount && form.currency !== "SGD" && (
                  <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                    {form.currency} {fmt(estimatedTotal)}
                  </div>
                )}
              </div>
              <span className="font-mono text-base font-bold tabular-nums">
                {hasAmount ? `SGD ${fmt(estimatedTotalSGD)}` : "—"}
              </span>
            </div>
          </div>
        </SectionCard>

        {/* ── Vendor ── */}
        <SectionCard icon={<Building2 />} title="Vendor Details and Quotation">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel htmlFor="req-vendor" text="Vendor name" required />
              <Input
                id="req-vendor"
                value={form.vendorName}
                onChange={(e) => update("vendorName", e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.vendorName || undefined}
                className="bg-card"
              />
              <FieldError id="req-vendor-error" message={errors.vendorName} />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="req-vendor-contact" text="Contact person" />
              <Input
                id="req-vendor-contact"
                value={form.vendorContact}
                onChange={(e) => update("vendorContact", e.target.value)}
                className="bg-card"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="req-vendor-email" text="Vendor email" />
              <Input
                id="req-vendor-email"
                type="email"
                value={form.vendorEmail}
                onChange={(e) => update("vendorEmail", e.target.value)}
                aria-invalid={!!errors.vendorEmail || undefined}
                className="bg-card"
              />
              <FieldError
                id="req-vendor-email-error"
                message={errors.vendorEmail}
              />
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-col gap-1.5">
          <Receipts
            files={files}
            onAdd={addFiles}
            onRemove={removeFile}
            title="Vendor Quotation (required)"
            hint="Attach the vendor quotation · PDF · JPG · PNG · Max 15 MB per file"
          />
          <FieldError id="req-quotation-error" message={errors.quotation} />
        </div>

        {/* ── Project ── */}
        <SectionCard icon={<Briefcase />} title="Project / Product Details">
          <div className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="req-project"
              text="Which project / customer is this for?"
              required
            />
            <Textarea
              id="req-project"
              value={form.projectCustomer}
              onChange={(e) => update("projectCustomer", e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.projectCustomer || undefined}
              className="min-h-20 resize-y bg-card"
            />
            <FieldError
              id="req-project-error"
              message={errors.projectCustomer}
            />
          </div>
        </SectionCard>

        <Button
          size="lg"
          className="h-12 w-full text-sm font-semibold"
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {submitting ? "Submitting" : "Submit Requisition"}
        </Button>
      </div>
    </div>
  )
}
