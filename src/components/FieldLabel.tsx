import { Label } from "@/components/ui/label"

interface FieldLabelProps {
  text: string
  required?: boolean
  /** Pair with a native input's `id` (label-for association). */
  htmlFor?: string
  /** Set when labelling a Radix Select trigger via its `aria-labelledby`. */
  id?: string
}

/** Consistent form-field label. Required fields get a decorative `*` (the
 *  required state itself is conveyed to assistive tech via `aria-required`). */
export function FieldLabel({ text, required, htmlFor, id }: FieldLabelProps) {
  return (
    <Label
      htmlFor={htmlFor}
      id={id}
      className="text-xs font-medium text-muted-foreground"
    >
      {text}{" "}
      {required && (
        <span className="text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </Label>
  )
}
