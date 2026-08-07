import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  FileDown,
  Inbox,
  Loader2,
  Receipt,
  ShoppingCart,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fetchMyRequests } from "@/lib/api"
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
  requisition: { label: "Purchase", short: "Purchase", icon: ShoppingCart },
}

/** SharePoint returns dates as ISO timestamps, show them as dd/mm/yyyy. */
function fmtDate(s: string) {
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

function TypeBadge({ type }: { type: RequestType }) {
  const { label, icon: Icon } = TYPE_META[type]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
}

export function MyRequests() {
  const [state, setState] = useState<LoadState>("loading")
  const [requests, setRequests] = useState<MyRequest[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

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

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: requests.length,
      expense: 0,
      leave: 0,
      requisition: 0,
    }
    for (const r of requests) c[r.type]++
    return c
  }, [requests])

  const visible = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.type === filter)),
    [requests, filter],
  )

  const FILTERS: Filter[] = ["all", "expense", "leave", "requisition"]

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            My Requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you've submitted: expenses, leave and purchases.
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
          <p className="text-sm font-medium">Nothing submitted yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Your expense claims, leave requests and purchase requisitions will
            appear here.
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
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
