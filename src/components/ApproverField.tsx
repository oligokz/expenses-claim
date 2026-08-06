import { FieldError } from "@/components/FieldError"
import { FieldLabel } from "@/components/FieldLabel"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ApproverOption } from "@/lib/types"

/** Radix Select cannot hold an empty string as a value, so "none" needs a token. */
export const NO_APPROVER = "__none__"

interface ApproverFieldProps {
  id: string
  label: string
  value: string
  onChange: (email: string) => void
  /** null while still loading. [] means the list loaded and is genuinely empty. */
  approvers: ApproverOption[] | null
  error?: string
  required?: boolean
  /** Offers an explicit "no approval needed" choice, for the optional stage. */
  allowNone?: boolean
  noneLabel?: string
}

/**
 * Picks an approver from the admin-managed list.
 *
 * The three states matter: while the list is loading we show a disabled
 * placeholder, because falling straight through to the free-text input made the
 * field visibly flip from "email, optional" to a dropdown a moment later. The
 * text input is only correct once we know the list came back empty.
 */
export function ApproverField({
  id,
  label,
  value,
  onChange,
  approvers,
  error,
  required,
  allowNone,
  noneLabel = "No second approval",
}: ApproverFieldProps) {
  const labelId = `${id}-label`

  if (approvers === null) {
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel id={labelId} text={label} required={required} />
        <Select disabled>
          <SelectTrigger
            id={id}
            className="w-full bg-card"
            aria-labelledby={labelId}
            aria-busy="true"
          >
            <SelectValue placeholder="Loading approvers" />
          </SelectTrigger>
          <SelectContent />
        </Select>
      </div>
    )
  }

  if (approvers.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={id} text={`${label} (email)`} />
        <Input
          id={id}
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter an email address"
          className="bg-card"
        />
        <FieldError id={`${id}-error`} message={error} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={labelId} text={label} required={required} />
      <Select
        value={value || undefined}
        onValueChange={(v) => onChange(v === NO_APPROVER ? "" : v)}
      >
        <SelectTrigger
          id={id}
          className="w-full bg-card"
          aria-labelledby={labelId}
          aria-required={required || undefined}
          aria-invalid={!!error || undefined}
        >
          <SelectValue placeholder={allowNone ? noneLabel : "Select approver"} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && (
            <SelectItem value={NO_APPROVER}>{noneLabel}</SelectItem>
          )}
          {approvers.map((a) => (
            <SelectItem key={a.email} value={a.email}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}
