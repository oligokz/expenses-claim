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
  Trash2,
  User,
} from "lucide-react"
import { toast } from "sonner"

import { ApproverField } from "@/components/ApproverField"
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
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  REQUISITION_OTHER,
} from "@/lib/constants"
import { fmt, num, toSGD } from "@/lib/currency"
import type {
  ApproverOption,
  Rates,
  RequisitionCategoryOption,
  RequisitionErrors,
  RequisitionForm,
  RequisitionItemErrors,
  RequisitionItemForm,
} from "@/lib/types"

/** Matches MAX_ITEMS in api/_lib/requisitionItems.js. */
const MAX_ITEMS = 20

let keySeq = 0
const blankItem = (): RequisitionItemForm => ({
  key: `item-${++keySeq}`,
  category: "",
  categoryOther: "",
  description: "",
  quantity: 1,
  unitPrice: "",
})

const blankForm = (): RequisitionForm => ({
  department: "",
  jobTitle: "",
  items: [blankItem()],
  currency: "SGD",
  vendorName: "",
  vendorContact: "",
  vendorEmail: "",
  projectCustomer: "",
  reportingManager: "",
  finalApprover: "",
})

type ItemField = keyof RequisitionItemErrors

/** DOM ids for an item's controls; the index keeps them unique per row. */
const itemFieldId = (field: ItemField, i: number) =>
  ({
    category: `req-cat-${i}`,
    categoryOther: `req-cat-other-${i}`,
    description: `req-desc-${i}`,
    quantity: `req-qty-${i}`,
    unitPrice: `req-price-${i}`,
  })[field]

const ITEM_FIELD_ORDER: ItemField[] = [
  "category",
  "categoryOther",
  "description",
  "quantity",
  "unitPrice",
]

/** Everything outside the items, in document order, split around them. */
const FIELD_IDS: Partial<Record<keyof RequisitionErrors, string>> = {
  department: "req-dept",
  reportingManager: "req-manager",
  finalApprover: "req-final-approver",
  vendorName: "req-vendor",
  vendorEmail: "req-vendor-email",
  projectCustomer: "req-project",
}
const BEFORE_ITEMS: (keyof RequisitionErrors)[] = [
  "department",
  "reportingManager",
  "finalApprover",
]
const AFTER_ITEMS: (keyof RequisitionErrors)[] = [
  "vendorName",
  "vendorEmail",
  "quotation",
  "projectCustomer",
]

/** The id of the first invalid control in document order, if it has one. */
function firstInvalidId(found: RequisitionErrors): string | undefined {
  for (const f of BEFORE_ITEMS) if (found[f]) return FIELD_IDS[f]
  const items = found.items ?? []
  for (let i = 0; i < items.length; i++) {
    const errs = items[i]
    if (!errs) continue
    const field = ITEM_FIELD_ORDER.find((k) => errs[k])
    if (field) return itemFieldId(field, i)
  }
  for (const f of AFTER_ITEMS) if (found[f]) return FIELD_IDS[f]
  return undefined
}

/** Same rounding as the server: cents on the price, then on the product. */
const round2 = (n: number) => Math.round(n * 100) / 100
const lineTotal = (it: RequisitionItemForm) =>
  round2(num(it.quantity) * round2(num(it.unitPrice)))

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
  // null until loaded, so the field can show a placeholder rather than flashing
  // its free-text fallback on every tab switch.
  const [approvers, setApprovers] = useState<ApproverOption[] | null>(null)
  const [finalApprovers, setFinalApprovers] = useState<ApproverOption[] | null>(
    null,
  )
  const [submitted, setSubmitted] = useState<{
    ref: string
    totalSGD: number
    items: number
    attachments: number
    notified: boolean
  } | null>(null)

  useEffect(() => {
    let alive = true
    fetchRequisitionCategories().then((c) => {
      if (alive) setCategories(c)
    })
    fetchApprovers("reporting")
      .then((a) => alive && setApprovers(a))
      .catch(() => alive && setApprovers([]))
    fetchApprovers("final")
      .then((a) => alive && setFinalApprovers(a))
      .catch(() => alive && setFinalApprovers([]))
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
      if (f.size > MAX_UPLOAD_BYTES) toast.error(`${f.name}: exceeds ${MAX_UPLOAD_LABEL}`)
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

  /* ── items ── */
  const updateItem = <K extends ItemField>(
    index: number,
    field: K,
    val: RequisitionItemForm[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) =>
        i === index ? { ...it, [field]: val } : it,
      ),
    }))
    setErrors((prev) => {
      const itemErrs = prev.items?.[index]
      if (!itemErrs || !(field in itemErrs)) return prev
      const items = [...(prev.items ?? [])]
      const next = { ...itemErrs }
      delete next[field]
      items[index] = next
      return { ...prev, items }
    })
  }

  const addItem = () => {
    if (form.items.length >= MAX_ITEMS) return
    const index = form.items.length
    setForm((prev) => ({ ...prev, items: [...prev.items, blankItem()] }))
    // Put the cursor in the new row, so adding reads as "now describe it".
    window.requestAnimationFrame(() => {
      document.getElementById(itemFieldId("category", index))?.focus()
    })
  }

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
    // Errors are stored by position, so they shift with the rows.
    setErrors((prev) =>
      prev.items
        ? { ...prev, items: prev.items.filter((_, i) => i !== index) }
        : prev,
    )
  }

  /* Estimated total, the sum of every line, converted for the committed figure. */
  const { estimatedTotal, estimatedTotalSGD, hasAmount } = useMemo(() => {
    const total = form.items.reduce((s, it) => s + lineTotal(it), 0)
    return {
      estimatedTotal: total,
      estimatedTotalSGD: toSGD(total, form.currency, rates),
      hasAmount: total > 0,
    }
  }, [form.items, form.currency, rates])

  const handleSubmit = async () => {
    const found: RequisitionErrors = {}
    if (!form.department) found.department = "Select a department"
    // Only required once there's a list to pick from, otherwise the free-text
    // fallback stays optional, as it was before.
    if ((approvers?.length ?? 0) > 0 && !form.reportingManager)
      found.reportingManager = "Select the approver"
    // Optional on purpose: leaving it blank makes stage 1 the final approval,
    // which is the single-stage shape leave and expense will want.
    /* Two stages signed by one person is one stage wearing a hat, but only
       complain when there's actually an alternative to choose. While a single
       approver is configured, insisting on two distinct people would make the
       flow impossible rather than safer. */
    const sameBoth =
      form.reportingManager &&
      form.finalApprover &&
      form.reportingManager.toLowerCase() === form.finalApprover.toLowerCase()
    const hasAlternative = (finalApprovers ?? []).some(
      (a) => a.email.toLowerCase() !== form.reportingManager.toLowerCase(),
    )
    if (sameBoth && hasAlternative) {
      found.finalApprover = "Pick someone other than the first approver"
    }
    const itemErrors = form.items.map((it) => {
      const e: RequisitionItemErrors = {}
      if (!it.category) e.category = "Select an item category"
      if (it.category === REQUISITION_OTHER && !it.categoryOther.trim())
        e.categoryOther = "Describe the category"
      if (!it.description.trim()) e.description = "Describe the item or service"
      if (num(it.quantity) <= 0) e.quantity = "Enter a quantity"
      if (num(it.unitPrice) <= 0) e.unitPrice = "Enter the unit price"
      return e
    })
    if (itemErrors.some((e) => Object.keys(e).length > 0))
      found.items = itemErrors
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
      const focusId = firstInvalidId(found)
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
          items: form.items.map((it) => ({
            category: it.category,
            categoryOther:
              it.category === REQUISITION_OTHER ? it.categoryOther : "",
            description: it.description,
            quantity: num(it.quantity),
            unitPrice: num(it.unitPrice),
          })),
          currency: form.currency,
          vendorName: form.vendorName,
          vendorContact: form.vendorContact,
          vendorEmail: form.vendorEmail,
          projectCustomer: form.projectCustomer,
          reportingManager: form.reportingManager,
          finalApprover: form.finalApprover,
          quotationAttached: files.length > 0,
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
          `Requisition submitted (${claimRef}). ${failed} attachment(s) need a retry`,
        )
      else toast.success(`Requisition submitted (${claimRef})`)

      setSubmitted({
        ref: claimRef,
        totalSGD: committedSGD,
        items: form.items.length,
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
            SGD {fmt(submitted.totalSGD)} · {submitted.items} item
            {submitted.items === 1 ? "" : "s"} · {submitted.attachments} attachment
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

            {/* Approvers come from a bounded SharePoint list. Both stages are
                chosen up front so the whole route is visible before submitting,
                rather than the second appearing out of a config the requester
                cannot see. */}
            <ApproverField
              id="req-manager"
              label="First approver"
              required
              value={form.reportingManager}
              onChange={(v) => update("reportingManager", v)}
              approvers={approvers}
              error={errors.reportingManager}
            />

            <ApproverField
              id="req-final-approver"
              label="Second approver (optional)"
              value={form.finalApprover}
              onChange={(v) => update("finalApprover", v)}
              approvers={finalApprovers}
              error={errors.finalApprover}
              allowNone
            />
          </div>
        </SectionCard>

        {/* ── Item / service ──
            One or more lines off the same vendor quotation, so they share a
            currency. A single item looks exactly as the form always did; the
            per-item header and remove control only appear once there are two. */}
        <SectionCard icon={<Package />} title="Item / Service Details">
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-3">
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
                    aria-describedby="req-cur-hint"
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
              <p
                id="req-cur-hint"
                className="self-end pb-2.5 text-xs text-muted-foreground sm:col-span-2"
              >
                Every item on this requisition is priced in {form.currency}.
              </p>
            </div>

            {form.items.map((item, i) => (
              <RequisitionItemFields
                key={item.key}
                index={i}
                item={item}
                multiple={form.items.length > 1}
                currency={form.currency}
                categories={categories}
                errors={errors.items?.[i] ?? {}}
                onChange={(field, val) => updateItem(i, field, val)}
                onRemove={() => removeItem(i)}
              />
            ))}

            {form.items.length < MAX_ITEMS ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full border-dashed text-sm"
                onClick={addItem}
              >
                <Plus className="size-4" />
                Add another item
              </Button>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                A requisition can hold up to {MAX_ITEMS} items. Submit a second
                requisition for the rest.
              </p>
            )}

            {/* Committed figure, the requester sees the converted total before submitting. */}
            <div className="flex items-center justify-between rounded-xl border bg-muted/50 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">
                  Estimated total cost
                  {form.items.length > 1 && ` · ${form.items.length} items`}
                </div>
                {hasAmount && form.currency !== "SGD" && (
                  <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                    {form.currency} {fmt(estimatedTotal)}
                  </div>
                )}
              </div>
              <span className="font-mono text-base font-bold tabular-nums">
                {hasAmount ? `SGD ${fmt(estimatedTotalSGD)}` : "-"}
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
            hint={`Attach the vendor quotation · PDF · JPG · PNG · Max ${MAX_UPLOAD_LABEL} per file`}
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

/** One line of the requisition: category, description, quantity, unit price. */
function RequisitionItemFields({
  index,
  item,
  multiple,
  currency,
  categories,
  errors,
  onChange,
  onRemove,
}: {
  index: number
  item: RequisitionItemForm
  /** Show the "Item N" header and remove control, only when there are several. */
  multiple: boolean
  currency: string
  categories: RequisitionCategoryOption[]
  errors: RequisitionItemErrors
  onChange: <K extends ItemField>(field: K, val: RequisitionItemForm[K]) => void
  onRemove: () => void
}) {
  const id = (field: ItemField) => itemFieldId(field, index)
  const showOther = item.category === REQUISITION_OTHER
  const total = lineTotal(item)
  const n = index + 1

  const fields = (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <FieldLabel id={`${id("category")}-label`} text="Item category" required />
          <Select
            value={item.category || undefined}
            onValueChange={(v) => onChange("category", v)}
          >
            <SelectTrigger
              id={id("category")}
              className="w-full bg-card"
              aria-labelledby={`${id("category")}-label`}
              aria-required="true"
              aria-invalid={!!errors.category || undefined}
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
          <FieldError id={`${id("category")}-error`} message={errors.category} />
        </div>

        {showOther && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={id("categoryOther")} text="If others" required />
            <Input
              id={id("categoryOther")}
              value={item.categoryOther}
              onChange={(e) => onChange("categoryOther", e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.categoryOther || undefined}
              placeholder="Specify the category"
              className="bg-card"
            />
            <FieldError
              id={`${id("categoryOther")}-error`}
              message={errors.categoryOther}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor={id("description")}
          text="Description of item / service"
          required
        />
        <Textarea
          id={id("description")}
          value={item.description}
          onChange={(e) => onChange("description", e.target.value)}
          aria-required="true"
          aria-invalid={!!errors.description || undefined}
          placeholder="Model, specification, part number, or scope of work"
          maxLength={2000}
          className="min-h-24 resize-y bg-card"
        />
        <FieldError id={`${id("description")}-error`} message={errors.description} />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={id("quantity")} text="Quantity" required />
          <Input
            id={id("quantity")}
            type="number"
            min={1}
            step="1"
            inputMode="numeric"
            value={item.quantity}
            onChange={(e) => onChange("quantity", e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.quantity || undefined}
            className="bg-card tabular-nums"
          />
          <FieldError id={`${id("quantity")}-error`} message={errors.quantity} />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={id("unitPrice")} text={`Unit price (${currency})`} required />
          <Input
            id={id("unitPrice")}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={item.unitPrice}
            onChange={(e) => onChange("unitPrice", e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.unitPrice || undefined}
            placeholder="0.00"
            className="bg-card tabular-nums"
          />
          <FieldError id={`${id("unitPrice")}-error`} message={errors.unitPrice} />
        </div>

        {/* Computed, not typed: read-only and out of the tab order. */}
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`req-line-total-${index}`} text="Line total" />
          <Input
            id={`req-line-total-${index}`}
            readOnly
            tabIndex={-1}
            value={total > 0 ? `${currency} ${fmt(total)}` : "-"}
            className="bg-muted text-right font-mono tabular-nums"
          />
        </div>
      </div>
    </div>
  )

  if (!multiple) return fields

  return (
    <fieldset className="rounded-xl border p-4 sm:p-5">
      <legend className="sr-only">Item {n}</legend>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Item {n}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove item ${n}`}
        >
          <Trash2 className="size-4" />
          Remove
        </Button>
      </div>
      {fields}
    </fieldset>
  )
}
