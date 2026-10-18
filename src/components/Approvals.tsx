import { useEffect, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { RefLabel, TypeBadge } from "@/components/MyRequests"
import { Initials } from "@/components/Initials"
import { cn } from "@/lib/utils"
import { fetchMyApprovals } from "@/lib/api"
import type { PendingApproval } from "@/lib/types"

type LoadState = "loading" | "ready" | "error"

const DAY = 24 * 60 * 60 * 1000

/** How long it has been waiting on you, in the largest unit that fits. */
function waited(since: string): { text: string; long: boolean } {
  const t = new Date(since).getTime()
  if (!since || isNaN(t)) return { text: "", long: false }
  const days = Math.floor((Date.now() - t) / DAY)
  const text =
    days < 1 ? "Today"
    : days < 14 ? `${days} day${days === 1 ? "" : "s"}`
    : days < 60 ? `${Math.floor(days / 7)} weeks`
    : `${Math.floor(days / 30)} months`
  // Past three days is worth drawing the eye to.
  return { text, long: days > 3 }
}

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
    // Capped like the other pages, so cards don't spread across a wide screen.
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Requests awaiting your approval, oldest first.
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
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary-text">
            <CheckCircle2 className="size-6" />
          </span>
          <p className="text-sm font-medium">No pending approvals</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Requests assigned to you will appear here.
          </p>
        </div>
      )}

      {state === "ready" && approvals.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {approvals.map((a) => {
            const w = waited(a.since || a.submittedOn)
            return (
              <li
                key={a.ref}
                className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <TypeBadge type={a.type} />
                    <RefLabel value={a.ref} />
                  </span>
                  {w.text && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-px text-[11px] font-semibold",
                        w.long
                          ? "border-warning/40 bg-warning/10 text-warning-foreground"
                          : "text-muted-foreground",
                      )}
                      title="Time since it reached you"
                    >
                      {w.text}
                    </span>
                  )}
                </div>

                <div className="truncate text-[15px] font-semibold">{a.title || a.kind}</div>
                {/* Who it's from carries as much weight as what it is. */}
                <div className="mt-1 flex min-w-0 items-center gap-2.5">
                  <Initials name={a.requester} className="size-8 text-xs" />
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-medium">{a.requester}</div>
                    {a.department && (
                      <div className="truncate text-xs text-muted-foreground">{a.department}</div>
                    )}
                  </div>
                </div>
                {a.step && (
                  <div>
                    <span className="rounded-full border px-2 py-px text-[11px] font-medium text-muted-foreground">
                      Your step: {a.step}
                    </span>
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                  <span className="font-mono text-lg font-bold tabular-nums">{a.figure || ""}</span>
                  <Button size="sm" variant="outline" onClick={() => open(a)}>
                    Review
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
