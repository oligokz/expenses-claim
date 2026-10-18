import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  BellRing,
  CalendarDays,
  ChevronDown,
  FileDown,
  Inbox,
  Loader2,
  Plane,
  Receipt,
  ShoppingCart,
  Trash2,
} from "lucide-react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Timeline } from "@/components/Timeline"
import { deleteRequest, fetchMyRequests, remindApprover } from "@/lib/api"
import { fmt } from "@/lib/currency"
import type { MyRequest, RequestType } from "@/lib/types"
import { cn } from "@/lib/utils"

type LoadState = "loading" | "ready" | "error"
/* By status rather than type: each row already says what it is, and what a
   requester wants to find is what is still open. */
type Filter = "all" | "pending" | "approved" | "rejected"
const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
}
/* A rough period rather than a date picker: "what did I submit lately" is
   the usual question, and one tap answers it on a phone. */
type Period = "all" | "30d" | "90d" | "year"
const PERIOD_LABEL: Record<Period, string> = {
  all: "All time",
  "30d": "Last 30 days",
  "90d": "Last 3 months",
  year: "This year",
}
function inPeriod(date: string, period: Period) {
  if (period === "all") return true
  const t = new Date(date).getTime()
  if (isNaN(t)) return true
  const now = new Date()
  if (period === "year") return new Date(t).getFullYear() === now.getFullYear()
  const days = period === "30d" ? 30 : 90
  return now.getTime() - t <= days * 24 * 60 * 60 * 1000
}

const statusOf = (r: MyRequest): Exclude<Filter, "all"> => {
  const s = (r.status || "Pending").toLowerCase()
  return s === "approved" ? "approved" : s === "rejected" ? "rejected" : "pending"
}

const TYPE_META: Record<
  RequestType,
  { label: string; short: string; icon: typeof Receipt }
> = {
  expense: { label: "Expense", short: "Expense", icon: Receipt },
  leave: { label: "Leave", short: "Leave", icon: CalendarDays },
  travel: { label: "Travel", short: "Travel", icon: Plane },
  requisition: { label: "Purchase", short: "Purchase", icon: ShoppingCart },
}

/** SharePoint returns dates as ISO timestamps, show them as dd/mm/yyyy. */
export function fmtDate(s: string) {
  if (!s) return "-"
  const d = new Date(s)
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  return (
    <Badge
      className={cn(
        "font-medium",
        s === "approved"
          ? "bg-success text-success-foreground hover:bg-success"
          : s === "rejected"
            ? "bg-destructive text-destructive-foreground hover:bg-destructive"
            : "bg-secondary text-secondary-foreground hover:bg-secondary",
      )}
    >
      {status}
    </Badge>
  )
}

/* One tint per type, so a list can be scanned by kind before reading. */
const TYPE_TINT: Record<RequestType, string> = {
  expense: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  leave: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  travel: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  requisition: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
}

export function TypeBadge({ type }: { type: RequestType }) {
  const { label, icon: Icon } = TYPE_META[type]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TYPE_TINT[type],
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
}

/** The reference, bold enough to read and quote at a glance. */
export function RefLabel({ value }: { value: string }) {
  return <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</span>
}

/* One reminder a day per request; the server holds the same line. */
const REMIND_GAP_MS = 20 * 60 * 60 * 1000
const canRemind = (r: MyRequest) =>
  !r.lastReminderAt || Date.now() - new Date(r.lastReminderAt).getTime() > REMIND_GAP_MS

const shortDate = (s: string) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""

/* Only a request nobody has decided yet can be deleted by its requester. The
 * server enforces this too; here it just decides whether to offer the control. */
const isPending = (status: string) =>
  !status || status.toLowerCase() === "pending"

export function MyRequests() {
  const [state, setState] = useState<LoadState>("loading")
  const [requests, setRequests] = useState<MyRequest[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [period, setPeriod] = useState<Period>("all")
  /** Row id awaiting confirmation, and the one currently being deleted. */
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [reminding, setReminding] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const load = () => {
    setState("loading")
    fetchMyRequests()
      .then(({ requests, warnings }) => {
        setRequests(requests)
        setWarnings(warnings)
        setState("ready")
      })
      .catch((e: Error) => {
        setError(e.message)
        setState("error")
      })
  }

  useEffect(load, [])

  /* The id carries its type: "travel-12" tells us both which list the row is in
   * and which item to remove. */
  const remove = async (r: MyRequest) => {
    const itemId = r.id.slice(r.type.length + 1)
    setDeleting(r.id)
    try {
      const { notified } = await deleteRequest(r.type, itemId)
      // Drop it locally rather than refetching: SharePoint can take a moment to
      // stop returning a just-deleted row, and seeing it reappear reads as a
      // failed delete.
      setRequests((prev) => prev.filter((x) => x.id !== r.id))
      setConfirming(null)
      toast.success(
        notified
          ? `${r.ref} deleted. Your approver has been told.`
          : `${r.ref} deleted.`,
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  const remind = async (r: MyRequest) => {
    setReminding(r.id)
    try {
      const { sentTo } = await remindApprover(r.type, r.id.slice(r.type.length + 1))
      const now = new Date().toISOString()
      setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, lastReminderAt: now } : x)))
      toast.success(`Reminder sent to ${sentTo}.`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setReminding(null)
    }
  }

  // The period narrows first, so the status counts describe what's in view.
  const inRange = useMemo(
    () => requests.filter((r) => inPeriod(r.date, period)),
    [requests, period],
  )

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: inRange.length,
      pending: 0,
      approved: 0,
      rejected: 0,
    }
    for (const r of inRange) c[statusOf(r)]++
    return c
  }, [inRange])

  const visible = useMemo(
    () => (filter === "all" ? inRange : inRange.filter((r) => statusOf(r) === filter)),
    [inRange, filter],
  )

  const FILTERS: Filter[] = ["all", "pending", "approved", "rejected"]

  return (
    // Capped like the forms, so a card's amount stays close to its title.
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            My Requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your submitted requests.
          </p>
        </div>
        {state === "ready" && requests.length > 0 && (
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
        )}
      </div>

      {/* A list that failed to load shouldn't silently look like "nothing here". */}
      {state === "ready" && warnings.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Some requests couldn't be loaded</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {warnings.map((w) => (
                <li key={w} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {state === "ready" && requests.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* The app's own dropdown, not a native select: its arrow lines up
              and its menu matches the rest of the app on every platform. */}
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger
              size="sm"
              aria-label="Period"
              className="rounded-full bg-card px-3 text-xs font-medium shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <SelectItem key={p} value={p} className="text-sm">
                  {PERIOD_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {FILTER_LABEL[f]} ({counts[f]})
            </button>
          ))}
        </div>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your requests…
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-16 text-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      {state === "ready" && requests.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Inbox className="size-6" />
          </span>
          <p className="text-sm font-medium">No requests yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Your submitted requests will appear here.
          </p>
        </div>
      )}

      {state === "ready" && requests.length > 0 && visible.length === 0 && (
        <div className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground">
          No {filter === "all" ? "" : FILTER_LABEL[filter].toLowerCase()} requests
          {period === "all" ? "" : ` in ${PERIOD_LABEL[period].toLowerCase()}`}.
        </div>
      )}

      {state === "ready" && visible.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visible.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4 shadow-sm">
              {/* Type and reference on the left, where it stands on the right. */}
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <TypeBadge type={r.type} />
                  <RefLabel value={r.ref} />
                </span>
                <div className="-my-1 -mr-2 flex shrink-0 items-center gap-0.5">
                  <StatusBadge status={r.status} />
                  {/* Only fully approved requisitions have a document to open. */}
                  {r.pdfUrl ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      title={`Open the signed PDF for ${r.ref}`}
                      aria-label={`Open the signed PDF for ${r.ref}`}
                      onClick={() => window.open(r.pdfUrl, "_blank", "noopener")}
                    >
                      <FileDown className="size-4" />
                    </Button>
                  ) : null}
                  {/* Deleting asks first, and is only offered while nobody has
                      decided: after that the row is the record of a decision. */}
                  {isPending(r.status) && confirming !== r.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title={`Delete ${r.ref}`}
                      aria-label={`Delete ${r.ref}`}
                      disabled={!!deleting}
                      onClick={() => setConfirming(r.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* What it is and when, with the amount opposite. Leave has no
                  money value, so it shows its duration instead. */}
              <div className="mt-1.5 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{r.title || "-"}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(r.date)}</div>
                </div>
                <div className="shrink-0 text-right font-mono text-base font-bold tabular-nums">
                  {r.amountSGD === null ? r.meta || "-" : `SGD ${fmt(r.amountSGD)}`}
                </div>
              </div>

              {/* Where it is now, so nobody has to guess and forward emails. */}
              {r.waitingOn && confirming !== r.id && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2">
                  <p className="min-w-0 text-xs text-muted-foreground">
                    With{" "}
                    <span className="font-medium text-foreground">{r.waitingOn.name}</span>
                    {r.waitingOn.stageLabel ? ` (${r.waitingOn.stageLabel})` : ""}
                    {r.waitingOn.since ? ` since ${shortDate(r.waitingOn.since)}` : ""}
                  </p>
                  {r.waitingOn.team ? null : canRemind(r) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={reminding === r.id}
                      onClick={() => remind(r)}
                    >
                      {reminding === r.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <BellRing className="size-3.5" />
                      )}
                      Remind
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Reminded {shortDate(r.lastReminderAt!)}
                    </span>
                  )}
                </div>
              )}

              {confirming === r.id && (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Delete <span className="font-medium text-foreground">{r.ref}</span>{" "}
                    and its attachments? Your approver will be told it was
                    withdrawn.
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!deleting}
                      onClick={() => setConfirming(null)}
                    >
                      Keep
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!!deleting}
                      onClick={() => remove(r)}
                    >
                      {deleting === r.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
              )}

              {r.route?.length > 1 && (
                <button
                  type="button"
                  onClick={() => toggleOpen(r.id)}
                  aria-expanded={open.has(r.id)}
                  className="-mx-1 mt-2 inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {open.has(r.id) ? "Hide progress" : "Show progress"}
                  <ChevronDown
                    className={cn("size-3.5 transition-transform motion-reduce:transition-none", open.has(r.id) && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
              )}
              {open.has(r.id) && (
                <div className="mt-2 rounded-lg border px-4 py-3">
                  <Timeline steps={r.route} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
