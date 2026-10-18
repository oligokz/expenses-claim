import { useState } from "react"
import { FileText, ImageIcon, Paperclip, UploadCloud, X } from "lucide-react"
import { SectionCard } from "@/components/SectionCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MAX_UPLOAD_LABEL } from "@/lib/constants"
import { cn } from "@/lib/utils"

interface ReceiptsProps {
  files: File[]
  onAdd: (files: FileList | null) => void
  onRemove: (index: number) => void
  title?: string
  hint?: string
}

function humanSize(bytes: number) {
  return bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`
}

export function Receipts({
  files,
  onAdd,
  onRemove,
  title = "Receipts",
  hint = `PDF or photo, up to ${MAX_UPLOAD_LABEL} each`,
}: ReceiptsProps) {
  const [drag, setDrag] = useState(false)

  return (
    <SectionCard
      icon={<Paperclip />}
      title={title}
      action={
        files.length > 0 ? (
          <Badge variant="secondary" className="font-medium">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </Badge>
        ) : undefined
      }
    >
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          onAdd(e.dataTransfer.files)
        }}
        className={cn(
          // A one-line row on phones, where the full drop target only pushed Submit away.
          "flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-left transition-colors sm:flex-col sm:gap-0 sm:py-8 sm:text-center",
          drag
            ? "border-primary bg-accent"
            : "border-border hover:border-muted-foreground/40 hover:bg-muted/40",
        )}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            onAdd(e.target.files)
            e.target.value = ""
          }}
        />
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground sm:mb-3 sm:size-12">
          <UploadCloud className="size-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm text-foreground">
            {/* Phones have nothing to drag, so only offer it where there is. */}
            <span className="font-semibold">Choose files</span>
            <span className="hidden sm:inline"> or drag them here</span>
          </span>
          <span className="mt-0.5 text-xs text-muted-foreground sm:mt-1">{hint}</span>
        </span>
      </label>

      {files.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5"
            >
              <span className="text-muted-foreground">
                {f.type.includes("pdf") ? (
                  <FileText className="size-5" />
                ) : (
                  <ImageIcon className="size-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  {humanSize(f.size)}
                </div>
              </div>
              <Badge className="bg-success text-success-foreground hover:bg-success">
                Ready
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-muted-foreground hover:text-destructive sm:size-8"
                onClick={() => onRemove(i)}
                aria-label="Remove file"
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
