import { CalendarDays, ListChecks, Receipt } from "lucide-react"
import { cn } from "@/lib/utils"

export type View = "expense" | "leave" | "history"

const TABS: { id: View; label: string; short: string; icon: typeof Receipt }[] = [
  { id: "expense", label: "New Expense", short: "Expense", icon: Receipt },
  { id: "leave", label: "Leave Request", short: "Leave", icon: CalendarDays },
  { id: "history", label: "My Requests", short: "Requests", icon: ListChecks },
]

export function AppNav({
  view,
  onChange,
}: {
  view: View
  onChange: (v: View) => void
}) {
  return (
    <nav className="sticky top-14 z-40 border-b bg-background">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto overflow-y-hidden px-2 sm:px-4">
        {TABS.map((t) => {
          const active = t.id === view
          const Icon = t.icon
          return (
            <button
              key={t.id}
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
