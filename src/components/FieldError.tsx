import { AlertCircle } from "lucide-react"

interface FieldErrorProps {
  /** Stable id so the field can point at this via `aria-describedby`. */
  id: string
  /** When undefined/empty, nothing renders. */
  message?: string
}

/** Inline, per-field validation message. Paired with `aria-invalid` on the control. */
export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null
  return (
    <p id={id} className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
      {message}
    </p>
  )
}
