import { ArrowRightLeft, RefreshCw } from "lucide-react"
import { DISPLAY_CURRENCIES, BIG_UNIT_CURRENCIES } from "@/lib/constants"
import type { Rates, RateStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

interface RatesPanelProps {
  rates: Rates
  status: RateStatus
  updatedAt: Date | null
  refreshing: boolean
  onRefresh: () => void
}

export function RatesPanel({
  rates,
  status,
  updatedAt,
  refreshing,
  onRefresh,
}: RatesPanelProps) {
  const shown = DISPLAY_CURRENCIES.filter((c) => rates[c])

  const statusText =
    status === "cached"
      ? "Using cached rates"
      : status === "live"
        ? `Live · Updated ${updatedAt?.toLocaleTimeString("en-SG", {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "Fetching live rates"

  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3.5">
        <div className="flex items-center gap-2 font-display text-sm font-semibold">
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-lg bg-secondary text-muted-foreground [&_svg]:size-3.5"
          >
            <ArrowRightLeft />
          </span>
          Live Exchange Rates
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh rates"
          className="grid size-8 place-items-center rounded-lg border bg-secondary text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="h-px w-6 bg-border" />
          Base Currency · SGD
        </div>

        {shown.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Fetching rates
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {shown.map((c) => {
              const big = BIG_UNIT_CURRENCIES.has(c)
              const v = rates[c].toLocaleString("en-SG", {
                maximumFractionDigits: big ? 0 : 4,
                minimumFractionDigits: big ? 0 : 2,
              })
              return (
                <div
                  key={c}
                  className="rounded-lg border bg-secondary px-2.5 py-2"
                >
                  <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                    SGD→{c}
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {v}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-center justify-center gap-2 border-t pt-3 text-[11px] text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              status === "live"
                ? "animate-pulse bg-success"
                : status === "cached"
                  ? "bg-warning"
                  : "bg-muted-foreground",
            )}
          />
          {statusText}
        </div>
      </div>
    </section>
  )
}
