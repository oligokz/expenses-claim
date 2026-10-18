import type { RouteStep } from "@/lib/types"
import { cn } from "@/lib/utils"

const BADGE: Record<RouteStep["status"], { text: string; className: string }> = {
  done: {
    text: "Done",
    className: "border-success/30 bg-success/10 text-success-text",
  },
  current: {
    text: "Pending",
    className: "border-foreground bg-foreground text-background",
  },
  upcoming: {
    text: "Upcoming",
    className: "border-border bg-card text-muted-foreground",
  },
  rejected: {
    text: "Rejected",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
}

const DOT: Record<RouteStep["status"], string> = {
  done: "border-success bg-card ring-success",
  current: "border-foreground bg-foreground",
  upcoming: "border-border bg-card",
  rejected: "border-destructive bg-destructive",
}

/** "15 Oct 2026, 10:00 am" in Singapore time; date only when there is no time. */
function fmtWhen(s: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const d = new Date(dateOnly ? `${s}T00:00:00+08:00` : s)
  if (isNaN(d.getTime())) return s
  const opts = { timeZone: "Asia/Singapore" } as const
  const date = d.toLocaleDateString("en-GB", { ...opts, day: "numeric", month: "short", year: "numeric" })
  if (dateOnly) return date
  const time = d.toLocaleTimeString("en-SG", { ...opts, hour: "numeric", minute: "2-digit" }).toLowerCase()
  // Date-only columns come back as midnight; a "12:00 am" there means nothing.
  return /^12:00\sam$/.test(time) ? date : `${date}, ${time}`
}

/** What happened at this step, in words: "Approved 15 Oct 2026, 10:00 am". */
function describe(s: RouteStep, prev?: RouteStep): string {
  if (s.label === "Submitted") return s.date ? `Submitted ${fmtWhen(s.date)}` : "Submitted"
  const what =
    s.status === "done" ? (s.date ? `Approved ${fmtWhen(s.date)}` : "Approved")
    : s.status === "rejected" ? (s.date ? `Rejected ${fmtWhen(s.date)}` : "Rejected")
    : s.status === "current" ? (prev?.date ? `Waiting since ${fmtWhen(prev.date)}` : "Waiting")
    : prev ? `After ${prev.name}` : ""
  // A one-person step like "Finance" needn't repeat its name as its role.
  return [s.label !== s.name ? s.label : "", what].filter(Boolean).join(" · ")
}

/**
 * A request's path as a vertical timeline: submitted, then each approver.
 * Steps still to come are dimmed, so where it stands reads at a glance. Dimmed
 * with the muted ink rather than opacity, which took the text below AA.
 */
export function Timeline({ steps, className }: { steps: RouteStep[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)} aria-label="Approval progress">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const dim = s.status === "upcoming"
        const sub = describe(s, steps[i - 1])
        return (
          <li key={`${s.label}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className="absolute top-5 bottom-0 left-[9px] w-0.5 bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                DOT[s.status],
              )}
            >
              {s.status === "done" && <span className="size-2 rounded-full bg-success" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("text-sm font-semibold", dim && "text-muted-foreground")}>
                  {s.name}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-px text-[11px] font-semibold",
                    BADGE[s.status].className,
                  )}
                >
                  {BADGE[s.status].text}
                </span>
              </div>
              {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
