import { useEffect, useState } from "react"
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  Lock,
  Plus,
  Send,
  StickyNote,
  User,
} from "lucide-react"
import { toast } from "sonner"

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

import { fetchLeaveTypes, submitLeave, uploadReceipt } from "@/lib/api"
import { DEPARTMENTS } from "@/lib/constants"
import { computeLeaveDays } from "@/lib/leave"
import type { LeaveErrors, LeaveForm, LeaveTypeOption } from "@/lib/types"

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const blankForm = (): LeaveForm => ({
  department: "",
  leaveType: "",
  startDate: todayIso(),
  endDate: todayIso(),
  portion: "Full",
  reason: "",
})

const dayLabel = (n: number) => `${n} ${n === 1 ? "day" : "days"}`

export function LeaveRequest({ employeeName }: { employeeName: string }) {
  const [form, setForm] = useState<LeaveForm>(blankForm)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<LeaveErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [types, setTypes] = useState<LeaveTypeOption[]>([])
  const [submitted, setSubmitted] = useState<{ ref: string; days: number } | null>(null)

  useEffect(() => {
    let alive = true
    fetchLeaveTypes().then((t) => {
      if (alive) setTypes(t)
    })
    return () => {
      alive = false
    }
  }, [])

  const update = <K extends keyof LeaveForm>(field: K, val: LeaveForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: val }))
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as keyof LeaveErrors]
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

  const single = !!form.startDate && form.startDate === form.endDate
  const days = computeLeaveDays(form.startDate, form.endDate, single ? form.portion : "Full")

  const handleSubmit = async () => {
    const found: LeaveErrors = {}
    if (!form.department) found.department = "Select a department"
    if (!form.leaveType) found.leaveType = "Select a leave type"
    if (!form.startDate) found.startDate = "Choose a start date"
    if (!form.endDate) found.endDate = "Choose an end date"
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      found.endDate = "End date is before the start date"
    if (Object.keys(found).length === 0 && days <= 0)
      found.endDate = "That range has no working days"

    if (Object.keys(found).length > 0) {
      setErrors(found)
      toast.error("Please complete the highlighted fields")
      return
    }
    setErrors({})

    setSubmitting(true)
    try {
      const { claimRef } = await submitLeave({
        department: form.department,
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        startPortion: single ? form.portion : "Full",
        endPortion: "Full",
        days,
        reason: form.reason,
      })

      let failed = 0
      for (let i = 0; i < files.length; i++) {
        try {
          await uploadReceipt(files[i], {
            employeeName,
            date: form.startDate,
            claimRef,
            index: i,
          })
        } catch (e) {
          console.warn(`Leave doc "${files[i].name}" failed:`, (e as Error).message)
          failed++
        }
      }

      if (failed > 0)
        toast.warning(`Leave submitted (${claimRef}) — ${failed} attachment(s) need a retry`)
      else toast.success(`Leave submitted (${claimRef})`)

      setSubmitted({ ref: claimRef, days })
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
            Leave request submitted
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dayLabel(submitted.days)} · recorded and awaiting review.
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
          New leave request
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Leave Request
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a leave request for manager approval.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <SectionCard icon={<User />} title="Claimant Information">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="leave-employee" text="Employee Name" required />
              <div className="relative">
                <Input
                  id="leave-employee"
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
              <FieldLabel id="leave-dept-label" text="Department" required />
              <Select
                value={form.department || undefined}
                onValueChange={(v) => update("department", v)}
              >
                <SelectTrigger
                  id="leave-dept"
                  className="w-full bg-card"
                  aria-labelledby="leave-dept-label"
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
              <FieldError id="leave-dept-error" message={errors.department} />
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={<CalendarDays />} title="Leave Details">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <FieldLabel id="leave-type-label" text="Leave type" required />
              <Select
                value={form.leaveType || undefined}
                onValueChange={(v) => update("leaveType", v)}
              >
                <SelectTrigger
                  id="leave-type"
                  className="w-full bg-card"
                  aria-labelledby="leave-type-label"
                  aria-required="true"
                  aria-invalid={!!errors.leaveType || undefined}
                >
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="leave-type-error" message={errors.leaveType} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="leave-start" text="Start date" required />
                <DateField
                  id="leave-start"
                  required
                  value={form.startDate}
                  onChange={(iso) => update("startDate", iso)}
                  aria-invalid={!!errors.startDate || undefined}
                />
                <FieldError id="leave-start-error" message={errors.startDate} />
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="leave-end" text="End date" required />
                <DateField
                  id="leave-end"
                  required
                  value={form.endDate}
                  onChange={(iso) => update("endDate", iso)}
                  aria-invalid={!!errors.endDate || undefined}
                />
                <FieldError id="leave-end-error" message={errors.endDate} />
              </div>

              {single && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel id="leave-portion-label" text="Duration" />
                  <Select
                    value={form.portion}
                    onValueChange={(v) => update("portion", v as LeaveForm["portion"])}
                  >
                    <SelectTrigger
                      className="w-full bg-card"
                      aria-labelledby="leave-portion-label"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full">Full day</SelectItem>
                      <SelectItem value="AM">Morning (½ day)</SelectItem>
                      <SelectItem value="PM">Afternoon (½ day)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-muted/50 px-4 py-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-mono text-base font-bold tabular-nums">
                {dayLabel(days)}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={<StickyNote />} title="Reason">
          <Textarea
            value={form.reason}
            onChange={(e) => update("reason", e.target.value)}
            aria-label="Reason for leave"
            placeholder="Optional — add any context for your manager"
            className="min-h-24 resize-y bg-card"
          />
        </SectionCard>

        <Receipts
          files={files}
          onAdd={addFiles}
          onRemove={removeFile}
          title="Supporting Document"
          hint="Attach an MC or supporting document if relevant · Max 15 MB per file"
        />

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
          {submitting ? "Submitting" : "Submit Leave Request"}
        </Button>
      </div>
    </div>
  )
}
