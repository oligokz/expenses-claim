import { useEffect, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtDate, TypeBadge } from "@/components/MyRequests"
import { fetchMyApprovals } from "@/lib/api"
import type { PendingApproval } from "@/lib/types"

type LoadState = "loading" | "ready" | "error"

/**
 * Everything waiting on the signed-in person. The approval email is otherwise
 * the only way in, and an approver who can't find it, or was forwarded the
 * requester's copy instead, had no route to the request at all.
 */
export function Approvals({
  onLoaded,
}: {
  /** Reports the count, so the tab badge and banner stay in step. */
  onLoaded?: (count: number) => void
}) {
  const [state, setState] = useState<LoadState>("loading")
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState("")

  const load = () => {
    setState("loading")
    fetchMyApprovals()
      .then(({ approvals, warnings }) => {
        setApprovals(approvals)
        setWarnings(warnings)
        onLoaded?.(approvals.length)
        setState("ready")
      })
      .catch((e: Error) => {
        setError(e.message)
        setState("error")
      })
  }

  useEffect(load, [])

  /* A full navigation rather than a state change: the approval page reads its
   * token from the URL, exactly as it does when opened from the email. */
  const open = (a: PendingApproval) => {
    window.location.assign(`/approve?t=${encodeURIComponent(a.token)}`)
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Requests waiting for your decision, oldest first.
          </p>
        </div>
        {state === "ready" && (
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
        )}
      </div>

      {state === "ready" && warnings.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Some approvals couldn't be loaded</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your approvals…
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

      {state === "ready" && approvals.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </span>
          <p className="text-sm font-medium">Nothing waiting for you</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            When someone names you as their approver, the request will appear
            here as well as in your email.
          </p>
        </div>
      )}

      {state === "ready" && approvals.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          {approvals.map((a) => (
            <li key={a.ref}>
              <button
                type="button"
                onClick={() => open(a)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left outline-none transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 sm:grid-cols-[7rem_1fr_9rem_auto]"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {a.ref}
                  </div>
                  <div className="mt-0.5">
                    <TypeBadge type={a.type} />
                  </div>
                </div>

                <div className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
                  <div className="truncate text-sm">{a.title || a.kind}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.requester}
                    {a.department ? `, ${a.department}` : ""} ·{" "}
                    {fmtDate(a.submittedOn)} · you are {a.stageLabel.toLowerCase()}
                  </div>
                </div>

                <div className="text-right font-mono text-sm font-semibold tabular-nums">
                  {a.figure || "-"}
                </div>

                <ChevronRight
                  className="hidden size-4 text-muted-foreground sm:block"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
