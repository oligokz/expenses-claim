import { useEffect, useState } from "react"
import { AlertCircle, Inbox, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fetchMyClaims } from "@/lib/api"
import { fmt } from "@/lib/currency"
import type { MyClaim } from "@/lib/types"
import { cn } from "@/lib/utils"

type LoadState = "loading" | "ready" | "error"

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

export function MyRequests() {
  const [state, setState] = useState<LoadState>("loading")
  const [claims, setClaims] = useState<MyClaim[]>([])
  const [error, setError] = useState("")

  const load = () => {
    setState("loading")
    fetchMyClaims()
      .then((c) => {
        setClaims(c)
        setState("ready")
      })
      .catch((e: Error) => {
        setError(e.message)
        setState("error")
      })
  }

  useEffect(load, [])

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          My Requests
        </h1>
        {state === "ready" && claims.length > 0 && (
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
        )}
      </div>

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

      {state === "ready" && claims.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Inbox className="size-6" />
          </span>
          <p className="text-sm font-medium">No claims yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Your submitted expense claims will appear here with their approval status.
          </p>
        </div>
      )}

      {state === "ready" && claims.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {/* Header row (desktop only) */}
          <div className="hidden grid-cols-[7rem_1fr_8rem_7rem] gap-4 border-b bg-secondary/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <div>Reference</div>
            <div>Category</div>
            <div className="text-right">Total (SGD)</div>
            <div className="text-right">Status</div>
          </div>

          <ul className="divide-y">
            {claims.map((c) => (
              <li
                key={c.id}
                className="grid grid-cols-2 gap-x-4 gap-y-1 px-5 py-3.5 sm:grid-cols-[7rem_1fr_8rem_7rem] sm:items-center"
              >
                <div className="font-mono text-sm font-semibold tabular-nums">
                  {c.claimRef}
                </div>
                <div className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
                  <div className="truncate text-sm">{c.category || "—"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.submissionDate}
                    {c.description ? ` · ${c.description}` : ""}
                  </div>
                </div>
                <div className="text-right font-mono text-sm font-semibold tabular-nums">
                  SGD {fmt(c.totalSGD)}
                </div>
                <div className="text-right">
                  <StatusBadge status={c.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
