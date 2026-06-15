import { CalendarClock } from "lucide-react"

export function LeaveRequest() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Leave Request
        </h1>
      </div>

      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card py-16 text-center shadow-sm">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <CalendarClock className="size-6" />
        </span>
        <p className="text-sm font-medium">Leave requests are coming next</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Submit annual, medical, unpaid, or compassionate leave with half-days,
          remaining balance, and the same manager approval as expenses. Needs the
          leave + entitlements lists set up first.
        </p>
      </div>
    </div>
  )
}
