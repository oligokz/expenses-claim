import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Phone-only bar pinned above the bottom nav: the figure that matters for this
 * form and its Submit button, always in the thumb zone while scrolling. From
 * the sm breakpoint up each form shows its own inline Submit instead.
 */
export function StickySubmit({
  label,
  value,
  sub,
  action,
  submitting,
  onSubmit,
}: {
  /** "Total (SGD)", "Leave", ... */
  label: string
  value: string
  /** A second, quieter figure, e.g. a trip's length. */
  sub?: string
  /** "Submit claim", ... */
  action: string
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom))] z-40 border-t bg-card py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] shadow-[0_-2px_10px_rgba(0,0,0,0.06)] sm:hidden">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
          <div className="truncate font-mono text-lg font-bold tabular-nums">{value}</div>
          {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
        </div>
        <Button
          size="lg"
          className="h-12 min-w-[150px] max-w-[240px] flex-1 text-sm font-semibold"
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {submitting ? "Submitting" : action}
        </Button>
      </div>
    </div>
  )
}
