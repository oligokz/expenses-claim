import { Lock, User } from "lucide-react"
import { ApproverField } from "@/components/ApproverField"
import { SectionCard } from "@/components/SectionCard"
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
import { DEPARTMENTS } from "@/lib/constants"
import type { ApproverOption, ClaimantForm, FormErrors } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ClaimantInfoProps {
  value: ClaimantForm
  onChange: <K extends keyof ClaimantForm>(field: K, val: ClaimantForm[K]) => void
  identityLocked: boolean
  errors: FormErrors
  /** null while loading; see ApproverField. */
  approvers: ApproverOption[] | null
}

export function ClaimantInfo({
  value,
  onChange,
  identityLocked,
  errors,
  approvers,
}: ClaimantInfoProps) {
  return (
    <SectionCard icon={<User />} title="Claimant Information">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="claimant-employee" text="Employee Name" required />
          <div className="relative">
            <Input
              id="claimant-employee"
              value={value.employee}
              placeholder="Full name"
              readOnly={identityLocked}
              required={!identityLocked}
              aria-required="true"
              aria-invalid={!!errors.employee || undefined}
              aria-describedby={
                errors.employee ? "claimant-employee-error" : undefined
              }
              onChange={(e) => onChange("employee", e.target.value)}
              className={cn(identityLocked && "bg-muted pr-9")}
            />
            {identityLocked && (
              <Lock
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
            )}
          </div>
          <FieldError id="claimant-employee-error" message={errors.employee} />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel id="claimant-dept-label" text="Department" required />
          <Select
            value={value.dept || undefined}
            onValueChange={(v) => onChange("dept", v)}
          >
            <SelectTrigger
              id="claimant-dept"
              className="w-full bg-card"
              aria-labelledby="claimant-dept-label"
              aria-required="true"
              aria-invalid={!!errors.dept || undefined}
              aria-describedby={errors.dept ? "claimant-dept-error" : undefined}
            >
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="claimant-dept-error" message={errors.dept} />
        </div>

        <ApproverField
          id="claimant-approver"
          label="Approver"
          required
          value={value.approverEmail}
          onChange={(v) => onChange("approverEmail", v)}
          approvers={approvers}
          error={errors.approverEmail}
        />
      </div>
    </SectionCard>
  )
}
