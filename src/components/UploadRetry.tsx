import { useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, RotateCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { uploadReceipt, type UploadMeta } from "@/lib/api"

export interface FailedUpload {
  file: File
  meta: UploadMeta
}

/**
 * Attachment outcome on a done screen. The request is already saved, so a
 * failed file is retried in place rather than by submitting again.
 */
export function UploadRetry({
  total,
  initialFailed,
  noun = "attachment",
}: {
  total: number
  initialFailed: FailedUpload[]
  noun?: string
}) {
  const [failed, setFailed] = useState(initialFailed)
  const [retrying, setRetrying] = useState(false)
  const plural = (n: number) => `${noun}${n === 1 ? "" : "s"}`

  const retry = async () => {
    setRetrying(true)
    const still: FailedUpload[] = []
    for (const f of failed) {
      try {
        await uploadReceipt(f.file, f.meta)
      } catch (e) {
        console.warn(`Retry failed for "${f.file.name}":`, (e as Error).message)
        still.push(f)
      }
    }
    setFailed(still)
    setRetrying(false)
    if (still.length === 0) toast.success(`All ${plural(total)} uploaded`)
    else toast.error(`${still.length} ${plural(still.length)} still failed`)
  }

  if (total === 0) return null
  if (failed.length === 0)
    return (
      <div className="flex items-center gap-2 text-sm text-foreground">
        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
        {total === 1 ? `1 ${noun} uploaded` : `All ${total} ${plural(total)} uploaded`}
      </div>
    )

  return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
        {total - failed.length} of {total} {plural(total)} uploaded
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {failed.map((f, i) => (
          <li key={`${f.file.name}-${i}`} className="truncate">
            {f.file.name}: not uploaded
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="mt-3" disabled={retrying} onClick={retry}>
        {retrying ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
        {retrying ? "Retrying" : `Retry ${failed.length} ${failed.length === 1 ? "upload" : "uploads"}`}
      </Button>
    </div>
  )
}
