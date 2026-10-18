import { useEffect, useRef } from "react"
import {
  CalendarDays,
  ClipboardCheck,
  ListChecks,
  Plane,
  Receipt,
  ShoppingCart,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type View =
  | "expense"
  | "leave"
  | "travel"
  | "requisition"
  | "history"
  | "approvals"
  /** Reached from the expense form and the user menu, not the tab bar, which
   *  is already full on a phone. */
  | "rates"

/* Each tab has its own path, so an email can link straight to My Requests or
 * Approvals. The bare origin used to be the only entry point, and it opens the
 * expense form, which is where REQ-19's approver landed. */
export const VIEW_PATHS: Record<View, string> = {
  expense: "/",
  leave: "/leave",
  travel: "/travel",
  requisition: "/requisition",
  history: "/my-requests",
  approvals: "/approvals",
  rates: "/rates",
}

/** The tab a path names, falling back to the expense form. */
export function viewFromPath(pathname: string): View {
  const path = pathname.replace(/\/+$/, "") || "/"
  const hit = (Object.keys(VIEW_PATHS) as View[]).find(
    (v) => VIEW_PATHS[v] === path,
  )
  return hit ?? "expense"
}

const TABS: { id: View; label: string; short: string; icon: typeof Receipt }[] = [
  { id: "expense", label: "New Expense", short: "Expense", icon: Receipt },
  { id: "leave", label: "Leave Request", short: "Leave", icon: CalendarDays },
  { id: "travel", label: "Travel Request", short: "Travel", icon: Plane },
  {
    id: "requisition",
    label: "Purchase Requisition",
    short: "Purchase",
    icon: ShoppingCart,
  },
  { id: "history", label: "My Requests", short: "Requests", icon: ListChecks },
  { id: "approvals", label: "Approvals", short: "Approve", icon: ClipboardCheck },
]

export function AppNav({
  view,
  onChange,
}: {
  view: View
  onChange: (v: View) => void
}) {
  /* Six tabs don't fit a phone, so the bar scrolls. Bring the active one into
   * view, otherwise a link to /approvals opens with its tab off the edge. */
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [view])

  return (
    <nav className="sticky top-14 z-40 border-b bg-background">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto overflow-y-hidden px-2 sm:px-4">
        {TABS.map((t) => {
          const active = t.id === view
          const Icon = t.icon
          return (
            <button
              key={t.id}
              ref={active ? activeRef : undefined}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-2 py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:flex-none sm:justify-start sm:px-3",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
              {active && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
