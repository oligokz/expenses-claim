import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  RotateCw,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { fmt } from "@/lib/currency"
import type { UploadMeta } from "@/lib/api"

export interface SubmitResult {
  claimRef: string
  totalSGD: number
  totalReceipts: number
  uploadedReceipts: number
  /** Receipts that failed to upload, retained so the user can retry. */
  failed: { file: File; meta: UploadMeta }[]
}

interface ClaimConfirmationProps {
  result: SubmitResult
  retrying: boolean
  onRetry: () => void
  onNewClaim: () => void
}

export function ClaimConfirmation({
  result,
  retrying,
  onRetry,
  onNewClaim,
}: ClaimConfirmationProps) {
  const { claimRef, totalSGD, totalReceipts, uploadedReceipts, failed } = result
  const hasFailures = failed.length > 0

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(claimRef)
      toast.success("Reference copied")
    } catch {
      toast.error("Couldn't copy — select the reference manually")
    }
  }

  return (
    <Card className="mx-auto max-w-md gap-0 overflow-hidden p-6 sm:p-7">
      <div className="flex flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-6" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">
          Claim submitted
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your expense claim has been recorded. Keep the reference below.
        </p>
      </div>

      {/* Proof-of-record: the charcoal "counter" block, echoing the summary panel. */}
      <div className="mt-6 rounded-xl bg-surface-dark px-5 py-4 text-surface-dark-foreground">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-surface-dark-muted">
          Claim reference
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="font-mono text-xl font-bold tabular-nums">
            {claimRef}
          </span>
          <button
            type="button"
            onClick={copyRef}
            aria-label="Copy claim reference"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-surface-dark-border bg-white/5 text-surface-dark-muted outline-none transition-colors hover:bg-white/10 hover:text-surface-dark-foreground focus-visible:ring-[3px] focus-visible:ring-white/40"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-surface-dark-border pt-3">
          <span className="text-xs text-surface-dark-muted">Total claim</span>
          <span className="font-mono text-lg font-bold tabular-nums">
            SGD {fmt(totalSGD)}
          </span>
        </div>
      </div>

      {/* Honest receipt status. */}
      <div className="mt-5">
        {totalReceipts === 0 ? (
          <p className="text-sm text-muted-foreground">No receipts attached.</p>
        ) : hasFailures ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
              {uploadedReceipts} of {totalReceipts} receipts uploaded
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {failed.map((f, i) => (
                <li key={`${f.file.name}-${i}`} className="truncate">
                  {f.file.name} — didn’t upload
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={retrying}
              onClick={onRetry}
            >
              {retrying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCw className="size-4" />
              )}
              {retrying
                ? "Retrying"
                : `Retry ${failed.length} upload${failed.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            All {totalReceipts} receipt{totalReceipts === 1 ? "" : "s"} uploaded
          </div>
        )}
      </div>

      <Button
        size="lg"
        className="mt-6 h-12 w-full text-sm font-semibold"
        onClick={onNewClaim}
      >
        <Plus className="size-4" />
        File another claim
      </Button>
    </Card>
  )
}
