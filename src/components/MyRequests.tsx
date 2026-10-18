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
import { Timeline } from "@/components/Timeline"
import { deleteRequest, fetchMyRequests, remindApprover } from "@/lib/api"
import { fmt } from "@/lib/currency"
import type { MyRequest, RequestType } from "@/lib/types"
import { cn } from "@/lib/utils"

type LoadState = "loading" | "ready" | "error"
type Filter = "all" | RequestType

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

export function TypeBadge({ type }: { type: RequestType }) {
  const { label, icon: Icon } = TYPE_META[type]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
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

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: requests.length,
      expense: 0,
      leave: 0,
      travel: 0,
      requisition: 0,
    }
    for (const r of requests) c[r.type]++
    return c
  }, [requests])

  const visible = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.type === filter)),
    [requests, filter],
  )

  const FILTERS: Filter[] = ["all", "expense", "leave", "travel", "requisition"]

  return (
    <div>
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
        <div className="mb-4 flex flex-wrap gap-2">
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
              {f === "all" ? "All" : TYPE_META[f].short} ({counts[f]})
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
          No {filter === "all" ? "" : TYPE_META[filter as RequestType].short.toLowerCase()}{" "}
          requests.
        </div>
      )}

      {state === "ready" && visible.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {/* Header row (desktop only) */}
          <div className="hidden grid-cols-[7rem_1fr_9rem_10rem] gap-4 border-b bg-secondary/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <div>Reference</div>
            <div>Details</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Status</div>
          </div>

          <ul className="divide-y">
            {visible.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-5 py-3.5 sm:grid-cols-[7rem_1fr_9rem_10rem] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {r.ref}
                  </div>
                  <div className="mt-0.5">
                    <TypeBadge type={r.type} />
                  </div>
                </div>

                <div className="order-2 col-span-2 min-w-0 sm:order-none sm:col-span-1">
                  <div className="truncate text-sm">{r.title || "-"}</div>
                  {/* Category and date only. Description and vendor are real
                      free text and push this line past the row on a phone. */}
                  <div className="truncate text-xs text-muted-foreground">
                    {fmtDate(r.date)}
                  </div>
                  {r.route?.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleOpen(r.id)}
                      aria-expanded={open.has(r.id)}
                      className="-mx-1 mt-1 inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {open.has(r.id) ? "Hide progress" : "Show progress"}
                      <ChevronDown
                        className={cn("size-3.5 transition-transform motion-reduce:transition-none", open.has(r.id) && "rotate-180")}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>

                {/* Leave carries no money value, show its duration instead of a
                    misleading SGD 0.00. */}
                <div className="text-right font-mono text-sm font-semibold tabular-nums">
                  {r.amountSGD === null ? (
                    <span className="text-muted-foreground">{r.meta || "-"}</span>
                  ) : (
                    `SGD ${fmt(r.amountSGD)}`
                  )}
                </div>

                {/* Status and document share a cell. On mobile order-3 puts
                    them after the details, so they land bottom right rather
                    than stranded between the reference and the title;
                    col-start-2 keeps them in the right-hand column. sm+ lets
                    the grid place them normally. */}
                <div className="order-3 col-start-2 -mt-1 flex items-center justify-end gap-1 sm:order-none sm:col-start-auto sm:mt-0">
                  <StatusBadge status={r.status} />
                  {/* Only fully approved requisitions have a document to open. */}
                  {r.pdfUrl ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-2 size-8 shrink-0 text-muted-foreground hover:text-foreground"
                      title={`Open the signed PDF for ${r.ref}`}
                      aria-label={`Open the signed PDF for ${r.ref}`}
                      onClick={() => window.open(r.pdfUrl, "_blank", "noopener")}
                    >
                      <FileDown className="size-4" />
                    </Button>
                  ) : null}

                  {/* Deleting is permanent from the user's side, so it asks
                      first rather than firing on a single stray tap. Only
                      offered while pending: once decided, the row is the
                      record of somebody's decision. */}
                  {isPending(r.status) &&
                    (confirming === r.id ? null : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="-mr-2 size-8 shrink-0 text-muted-foreground hover:text-destructive"
                        title={`Delete ${r.ref}`}
                        aria-label={`Delete ${r.ref}`}
                        disabled={!!deleting}
                        onClick={() => setConfirming(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ))}
                </div>

                {/* Where it is now. Before this, "Pending" was all a requester
                    saw, and REQ-19's requester forwarded the wrong email to
                    find out. */}
                {r.waitingOn && confirming !== r.id && (
                  <div className="order-4 col-span-2 mt-1 flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2 sm:col-span-4">
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

                {open.has(r.id) && (
                  <div className="order-5 col-span-2 mt-2 rounded-lg border bg-card px-4 py-3 sm:col-span-4">
                    <Timeline steps={r.route} />
                  </div>
                )}

                {confirming === r.id && (
                  <div className="order-4 col-span-2 mt-2 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 sm:col-span-4 sm:flex-row sm:items-center sm:justify-between">
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
