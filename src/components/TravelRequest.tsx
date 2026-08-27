import { useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  Loader2,
  Lock,
  Plane,
  Plus,
  Send,
  User,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { ApproverField } from "@/components/ApproverField"
import { SectionCard } from "@/components/SectionCard"
import { DateField } from "@/components/DateField"
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

import { fetchApprovers, submitTravel, uploadReceipt } from "@/lib/api"
import { DEPARTMENTS, TRAVEL_BUDGET_LINES } from "@/lib/constants"
import { fmt, num } from "@/lib/currency"
import type { ApproverOption, TravelErrors, TravelForm } from "@/lib/types"

const blankForm = (): TravelForm => ({
  department: "",
  jobTitle: "",
  purpose: "",
  eventName: "",
  destination: "",
  travelFrom: "",
  travelTo: "",
  agenda: "",
  costFlight: "",
  costHotel: "",
  costEventFees: "",
  costTransport: "",
  costOther: "",
  costOtherNote: "",
  reportingManager: "",
  financeApprover: "",
  finalApprover: "",
})

/** DOM ids for required controls, in document order, to focus the first invalid one. */
const FIELD_IDS: Partial<Record<keyof TravelErrors, string>> = {
  department: "trv-dept",
  reportingManager: "trv-manager",
  financeApprover: "trv-finance",
  finalApprover: "trv-final",
  purpose: "trv-purpose",
  destination: "trv-destination",
  travelFrom: "trv-from",
  travelTo: "trv-to",
  agenda: "trv-agenda",
  budget: "trv-cost-costFlight",
}
const FIELD_ORDER: (keyof TravelErrors)[] = [
  "department",
  "reportingManager",
  "financeApprover",
  "finalApprover",
  "purpose",
  "destination",
  "travelFrom",
  "travelTo",
  "agenda",
  "budget",
]

/** The budget line keys, narrowed so indexing the form stays type-safe. */
type CostKey =
  | "costFlight"
  | "costHotel"
  | "costEventFees"
  | "costTransport"
  | "costOther"

export function TravelRequest({ employeeName }: { employeeName: string }) {
  const [form, setForm] = useState<TravelForm>(blankForm)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<TravelErrors>({})
  const [submitting, setSubmitting] = useState(false)
  // null until loaded, so the field shows a placeholder rather than flashing
  // its free-text fallback on every tab switch.
  const [approvers, setApprovers] = useState<ApproverOption[] | null>(null)
  const [submitted, setSubmitted] = useState<{
    ref: string
    totalSGD: number
    attachments: number
    notified: boolean
  } | null>(null)

  useEffect(() => {
    let alive = true
    // All three stages draw from the same roster; everyone on it approves at
    // any stage, so there is no per-stage filtering to do here.
    fetchApprovers("all")
      .then((a) => alive && setApprovers(a))
      .catch(() => alive && setApprovers([]))
    return () => {
      alive = false
    }
  }, [])

  const update = <K extends keyof TravelForm>(field: K, val: TravelForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: val }))
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as keyof TravelErrors]
      return next
    })
  }

  const updateCost = (key: CostKey, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }))
    setErrors((prev) => {
      if (!prev.budget) return prev
      const next = { ...prev }
      delete next.budget
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
    if (accepted.length) setFiles((prev) => [...prev, ...accepted])
  }
  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i))

  /* The budget is SGD throughout, so the total is a plain sum with no
   * conversion. Recomputed server-side on submit regardless. */
  const total = useMemo(
    () =>
      TRAVEL_BUDGET_LINES.reduce(
        (sum, line) => sum + num(form[line.key as CostKey]),
        0,
      ),
    [form],
  )

  const handleSubmit = async () => {
    const found: TravelErrors = {}
    if (!form.department) found.department = "Select a department"
    // Only required once there is a list to pick from; the free-text fallback
    // stays optional, matching the other modules.
    if ((approvers?.length ?? 0) > 0) {
      if (!form.reportingManager)
        found.reportingManager = "Select the reporting manager"
      if (!form.financeApprover)
        found.financeApprover = "Select the Finance/HR approver"
      if (!form.finalApprover) found.finalApprover = "Select the final approver"
    }
    if (!form.purpose.trim()) found.purpose = "State the purpose of travel"
    if (!form.destination.trim()) found.destination = "Enter the destination"
    if (!form.travelFrom) found.travelFrom = "Choose the departure date"
    if (!form.travelTo) found.travelTo = "Choose the return date"
    if (form.travelFrom && form.travelTo && form.travelTo < form.travelFrom)
      found.travelTo = "The return date cannot be before departure"
    if (!form.agenda.trim())
      found.agenda = "Outline the objective or key meetings"
    if (total <= 0) found.budget = "Enter at least one expected cost"

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
      const { claimRef, totalSGD, notified } = await submitTravel({
        department: form.department,
        jobTitle: form.jobTitle,
        purpose: form.purpose,
        eventName: form.eventName,
        destination: form.destination,
        travelFrom: form.travelFrom,
        travelTo: form.travelTo,
        agenda: form.agenda,
        costFlight: num(form.costFlight),
        costHotel: num(form.costHotel),
        costEventFees: num(form.costEventFees),
        costTransport: num(form.costTransport),
        costOther: num(form.costOther),
        costOtherNote: form.costOtherNote,
        reportingManager: form.reportingManager,
        financeApprover: form.financeApprover,
        finalApprover: form.finalApprover,
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
            `Travel document "${files[i].name}" failed:`,
            (e as Error).message,
          )
          failed++
        }
      }

      if (failed > 0)
        toast.warning(
          `Travel request submitted (${claimRef}). ${failed} attachment(s) need a retry`,
        )
      else toast.success(`Travel request submitted (${claimRef})`)

      setSubmitted({
        ref: claimRef,
        totalSGD,
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
            Travel request submitted
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SGD {fmt(submitted.totalSGD)} · {submitted.attachments} attachment
            {submitted.attachments === 1 ? "" : "s"} ·{" "}
            {/* Only claim the approver was told if the email actually sent. */}
            {submitted.notified
              ? "your reporting manager has been emailed."
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
          New travel request
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Travel Request
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request approval for business travel.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {/* ── Employee ── */}
        <SectionCard icon={<User />} title="Employee Information">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="trv-employee" text="Name" required />
              <div className="relative">
                <Input
                  id="trv-employee"
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
              <FieldLabel id="trv-dept-label" text="Department" required />
              <Select
                value={form.department || undefined}
                onValueChange={(v) => update("department", v)}
              >
                <SelectTrigger
                  id="trv-dept"
                  className="w-full bg-card"
                  aria-labelledby="trv-dept-label"
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
              <FieldError id="trv-dept-error" message={errors.department} />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel htmlFor="trv-job-title" text="Job Title" />
              <Input
                id="trv-job-title"
                value={form.jobTitle}
                onChange={(e) => update("jobTitle", e.target.value)}
                placeholder="Your role"
                className="bg-card"
              />
            </div>
          </div>
        </SectionCard>

        {/* ── Travel details ── */}
        <SectionCard icon={<Plane />} title="Travel Details">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel htmlFor="trv-purpose" text="Purpose of Travel" required />
              <Input
                id="trv-purpose"
                value={form.purpose}
                onChange={(e) => update("purpose", e.target.value)}
                placeholder="Why this trip is needed"
                aria-required="true"
                aria-invalid={!!errors.purpose || undefined}
                className="bg-card"
              />
              <FieldError id="trv-purpose-error" message={errors.purpose} />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel
                htmlFor="trv-event"
                text="Meeting / Event Name (if applicable)"
              />
              <Input
                id="trv-event"
                value={form.eventName}
                onChange={(e) => update("eventName", e.target.value)}
                placeholder="Conference, customer meeting, site visit"
                className="bg-card"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel htmlFor="trv-destination" text="Destination" required />
              <Input
                id="trv-destination"
                value={form.destination}
                onChange={(e) => update("destination", e.target.value)}
                placeholder="City, country"
                aria-required="true"
                aria-invalid={!!errors.destination || undefined}
                className="bg-card"
              />
              <FieldError
                id="trv-destination-error"
                message={errors.destination}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="trv-from" text="Travel Date (From)" required />
              <DateField
                id="trv-from"
                value={form.travelFrom}
                onChange={(iso) => update("travelFrom", iso)}
                aria-required="true"
                aria-invalid={!!errors.travelFrom || undefined}
                className="bg-card"
              />
              <FieldError id="trv-from-error" message={errors.travelFrom} />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="trv-to" text="Travel Date (To)" required />
              <DateField
                id="trv-to"
                value={form.travelTo}
                onChange={(iso) => update("travelTo", iso)}
                aria-required="true"
                aria-invalid={!!errors.travelTo || undefined}
                className="bg-card"
              />
              <FieldError id="trv-to-error" message={errors.travelTo} />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel htmlFor="trv-agenda" text="Travel Agenda" required />
              <Textarea
                id="trv-agenda"
                value={form.agenda}
                onChange={(e) => update("agenda", e.target.value)}
                placeholder="Trip objective, key meetings, expected business outcomes"
                aria-required="true"
                aria-invalid={!!errors.agenda || undefined}
                className="min-h-28 resize-y bg-card"
              />
              <FieldError id="trv-agenda-error" message={errors.agenda} />
            </div>
          </div>
        </SectionCard>

        {/* ── Budget ── */}
        <SectionCard icon={<Wallet />} title="Expected Travel & Expenses Budget">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Enter the expected cost per category in SGD. Attach supporting
              documents below, such as a flight quote.
            </p>

            <div className="flex flex-col gap-3">
              {TRAVEL_BUDGET_LINES.map((line) => (
                <div
                  key={line.key}
                  className="grid grid-cols-[1fr_auto] items-center gap-3"
                >
                  <FieldLabel
                    htmlFor={`trv-cost-${line.key}`}
                    text={line.label}
                  />
                  <Input
                    id={`trv-cost-${line.key}`}
                    value={form[line.key as CostKey]}
                    onChange={(e) =>
                      updateCost(line.key as CostKey, e.target.value)
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`${line.label} expected cost in SGD`}
                    className="w-36 bg-card text-right font-mono tabular-nums"
                  />
                </div>
              ))}

              {num(form.costOther) > 0 && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="trv-other-note"
                    text="What are the other expenses for?"
                  />
                  <Input
                    id="trv-other-note"
                    value={form.costOtherNote}
                    onChange={(e) => update("costOtherNote", e.target.value)}
                    placeholder="Visa fees, travel insurance"
                    className="bg-card"
                  />
                </div>
              )}
            </div>

            <FieldError id="trv-budget-error" message={errors.budget} />

            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
              <span className="text-sm font-semibold">
                Total estimated cost
              </span>
              <span className="font-mono text-lg font-bold tabular-nums">
                SGD {fmt(total)}
              </span>
            </div>
          </div>
        </SectionCard>

        <Receipts
          files={files}
          onAdd={addFiles}
          onRemove={removeFile}
          title="Supporting Documents"
          hint="Flight quotes, hotel rates, event registration · Max 15 MB per file"
        />

        {/* ── Approvals ── */}
        <SectionCard icon={<CheckCircle2 />} title="Approvers">
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Travel requests are approved in order: reporting manager, then
              Finance/HR, then final approval. Each is emailed in turn.
            </p>
            <ApproverField
              id="trv-manager"
              label="Reporting Manager"
              required
              value={form.reportingManager}
              onChange={(v) => update("reportingManager", v)}
              approvers={approvers}
              error={errors.reportingManager}
            />
            <ApproverField
              id="trv-finance"
              label="Finance / HR"
              required
              value={form.financeApprover}
              onChange={(v) => update("financeApprover", v)}
              approvers={approvers}
              error={errors.financeApprover}
            />
            <ApproverField
              id="trv-final"
              label="Final Approval"
              required
              value={form.finalApprover}
              onChange={(v) => update("finalApprover", v)}
              approvers={approvers}
              error={errors.finalApprover}
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
          {submitting ? "Submitting" : "Submit Travel Request"}
        </Button>
      </div>
    </div>
  )
}
