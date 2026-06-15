import { useState } from "react"
import { FileText, ImageIcon, Paperclip, UploadCloud, X } from "lucide-react"
import { SectionCard } from "@/components/SectionCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  title = "Receipt Attachments",
  hint = "PDF · JPG · PNG · HEIC · Max 15 MB per file",
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
          "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          drag
            ? "border-primary bg-accent"
            : "border-border hover:border-muted-foreground/40 hover:bg-muted/40",
        )}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          className="hidden"
          onChange={(e) => {
            onAdd(e.target.files)
            e.target.value = ""
          }}
        />
        <span className="mb-3 grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
          <UploadCloud className="size-5" />
        </span>
        <span className="text-sm text-foreground">
          <span className="font-semibold">Click to browse</span> or drag &amp; drop
          files here
        </span>
        <span className="mt-1 text-xs text-muted-foreground">{hint}</span>
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
                className="size-7 text-muted-foreground hover:text-destructive"
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
