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
  /** Reached from the expense form, the user menu and the phone's More sheet,
   *  not the tab bar. */
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

/** `short` is what the top bar shows below lg, where six full labels overflow. */
export type Tab = { id: View; label: string; short: string; icon: typeof Receipt }

/** The four forms. On a phone they sit behind the bottom bar's New button. */
export const FORM_TABS: (Tab & { hint: string })[] = [
  {
    id: "expense",
    label: "New Expense",
    short: "Expense",
    icon: Receipt,
    hint: "Claim back money you spent",
  },
  {
    id: "leave",
    label: "Leave Request",
    short: "Leave",
    icon: CalendarDays,
    hint: "Ask for time off",
  },
  {
    id: "travel",
    label: "Travel Request",
    short: "Travel",
    icon: Plane,
    hint: "Get a business trip approved",
  },
  {
    id: "requisition",
    label: "Purchase Requisition",
    short: "Purchase",
    icon: ShoppingCart,
    hint: "Ask to buy items or services",
  },
]

export const HISTORY_TAB: Tab = {
  id: "history",
  label: "My Requests",
  short: "My Requests",
  icon: ListChecks,
}

export const APPROVALS_TAB: Tab = {
  id: "approvals",
  label: "Approvals",
  short: "Approvals",
  icon: ClipboardCheck,
}

const TABS: Tab[] = [...FORM_TABS, HISTORY_TAB, APPROVALS_TAB]

/** Top tab bar from the sm breakpoint up. Phones get MobileNav instead. */
export function AppNav({
  view,
  onChange,
}: {
  view: View
  onChange: (v: View) => void
}) {
  /* Short labels fit from sm up. The bar still scrolls as a fallback for a
   * large text size, so bring the active tab into view, otherwise a link to
   * /approvals could open with its tab off the edge. */
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [view])

  return (
    <nav
      aria-label="Main"
      className="sticky top-14 z-40 hidden border-b bg-background sm:block"
    >
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto overflow-y-hidden px-4">
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
                "relative flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-3 text-sm lg:gap-2 lg:px-3 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 motion-reduce:transition-none",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="lg:hidden">{t.short}</span>
              <span className="hidden lg:inline">{t.label}</span>
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
