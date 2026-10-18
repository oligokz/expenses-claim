import { useState, type ReactNode } from "react"
import {
  ArrowRightLeft,
  Check,
  ChevronRight,
  LogOut,
  SunMoon,
  Menu,
  SquarePen,
  X,
} from "lucide-react"
import { Dialog } from "radix-ui"
import {
  APPROVALS_TAB,
  FORM_TABS,
  HISTORY_TAB,
  type View,
} from "@/components/AppNav"
import { ThemeSegmented } from "@/components/ThemeChoice"
import { cn } from "@/lib/utils"

const FORM_VIEWS = new Set<View>(FORM_TABS.map((t) => t.id))

const ITEM =
  "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 motion-reduce:transition-none"

/** One bottom-bar entry. The pill behind the icon marks the current one. */
function BarItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge = 0,
  ...rest
}: {
  icon: typeof Menu
  label: string
  active: boolean
  onClick?: () => void
  /** A count shown on the icon, e.g. approvals waiting. */
  badge?: number
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        ITEM,
        active
          ? "font-semibold text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
      {...rest}
    >
      <span
        className={cn(
          "relative grid h-7 w-12 place-items-center rounded-full transition-colors motion-reduce:transition-none",
          active && "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        {badge > 0 && (
          <span className="absolute -top-1 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {badge > 9 ? "9+" : badge}
            <span className="sr-only"> waiting</span>
          </span>
        )}
      </span>
      {label}
    </button>
  )
}

/** Bottom sheet built on Radix Dialog, so focus is trapped while it's open
 *  and goes back to the bar button when it closes. */
function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[70] max-h-[85dvh] overflow-y-auto rounded-t-xl border-t bg-card pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-card-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <Dialog.Title className="text-sm font-semibold tracking-tight">
              {title}
            </Dialog.Title>
            <Dialog.Close className="grid size-10 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-1 p-2">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const ROW =
  "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none"

function RowIcon({ icon: Icon }: { icon: typeof Menu }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
      <Icon className="size-[18px]" aria-hidden="true" />
    </span>
  )
}

/**
 * Phone navigation: a bottom tab bar in the thumb zone. Six top tabs don't fit
 * at 375px and the ones that fell off the edge were My Requests and Approvals,
 * which is where an approver needs to land. So those two get their own slots,
 * the four forms share New, and the user menu's items repeat under More.
 */
export function MobileNav({
  view,
  onChange,
  userName,
  onLogout,
  approvalsCount = 0,
}: {
  view: View
  onChange: (v: View) => void
  userName: string
  onLogout: () => void
  approvalsCount?: number
}) {
  const [sheet, setSheet] = useState<"new" | "more" | null>(null)

  const go = (v: View) => {
    setSheet(null)
    onChange(v)
  }

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-card pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:hidden"
      >
        <div className="flex h-[var(--mobile-nav-h)] items-stretch gap-1 px-1">
          <BarItem
            icon={SquarePen}
            label="New"
            active={FORM_VIEWS.has(view)}
            onClick={() => setSheet("new")}
            aria-haspopup="dialog"
          />
          <BarItem
            icon={HISTORY_TAB.icon}
            label="My Requests"
            active={view === HISTORY_TAB.id}
            onClick={() => go(HISTORY_TAB.id)}
            aria-current={view === HISTORY_TAB.id ? "page" : undefined}
          />
          <BarItem
            icon={APPROVALS_TAB.icon}
            label="Approvals"
            active={view === APPROVALS_TAB.id}
            badge={approvalsCount}
            onClick={() => go(APPROVALS_TAB.id)}
            aria-current={view === APPROVALS_TAB.id ? "page" : undefined}
          />
          <BarItem
            icon={Menu}
            label="More"
            active={view === "rates"}
            onClick={() => setSheet("more")}
            aria-haspopup="dialog"
          />
        </div>
      </nav>

      <Sheet
        open={sheet === "new"}
        onOpenChange={(o) => setSheet(o ? "new" : null)}
        title="New request"
      >
        {FORM_TABS.map((t) => {
          const current = t.id === view
          return (
            <button
              key={t.id}
              type="button"
              className={cn(ROW, current && "bg-accent")}
              aria-current={current ? "page" : undefined}
              onClick={() => go(t.id)}
            >
              <RowIcon icon={t.icon} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.hint}
                </span>
              </span>
              {current ? (
                <Check
                  className="size-4 shrink-0 text-accent-foreground"
                  aria-label="Open now"
                />
              ) : (
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </Sheet>

      <Sheet
        open={sheet === "more"}
        onOpenChange={(o) => setSheet(o ? "more" : null)}
        title={userName || "More"}
      >
        <button
          type="button"
          className={cn(ROW, view === "rates" && "bg-accent")}
          aria-current={view === "rates" ? "page" : undefined}
          onClick={() => go("rates")}
        >
          <RowIcon icon={ArrowRightLeft} />
          <span className="flex-1 text-sm font-semibold">Exchange rates</span>
        </button>
        {/* Laid out like the rows around it: icon tile, label, and the
            switch aligned under the label rather than at the sheet's edge. */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-3">
            <RowIcon icon={SunMoon} />
            <span className="flex-1 text-sm font-semibold">Appearance</span>
          </div>
          <div className="mt-2 pl-12">
            <ThemeSegmented />
          </div>
        </div>
        <button
          type="button"
          className={ROW}
          onClick={() => {
            setSheet(null)
            onLogout()
          }}
        >
          <RowIcon icon={LogOut} />
          <span className="flex-1 text-sm font-semibold">Sign out</span>
        </button>
      </Sheet>
    </>
  )
}
