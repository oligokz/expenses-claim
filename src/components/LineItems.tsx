import { Receipt } from "lucide-react"
import { SectionCard } from "@/components/SectionCard"
import { Badge } from "@/components/ui/badge"
import { DateField } from "@/components/DateField"
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
import {
  ALL_CURRENCIES,
  CATEGORIES,
  CURRENCY_NAMES,
} from "@/lib/constants"
import { fmt, num, toSGD } from "@/lib/currency"
import type { FormErrors, LineRow, Rates } from "@/lib/types"

interface ExpenseDetailsProps {
  row: LineRow
  rates: Rates
  onUpdate: <K extends keyof LineRow>(field: K, val: LineRow[K]) => void
  errors: FormErrors
}

export function LineItems({ row, rates, onUpdate, errors }: ExpenseDetailsProps) {
  const lineTotal = num(row.amt) * (num(row.qty) || 1)
  const sgd = toSGD(lineTotal, row.cur, rates)
  const rateNote =
    row.cur !== "SGD" && row.amt ? `@ ${fmt(rates[row.cur] || 1, 4)}/SGD` : ""

  return (
    <SectionCard
      icon={<Receipt />}
      title="Expense Details"
      action={
        <Badge variant="secondary" className="font-medium">
          Single entry
        </Badge>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Category first, then Description */}
        <div className="flex flex-col gap-1.5">
          <FieldLabel id="line-cat-label" text="Category" required />
          <Select
            value={row.cat || undefined}
            onValueChange={(v) => onUpdate("cat", v)}
          >
            <SelectTrigger
              id="line-cat"
              className="w-full bg-card"
              aria-labelledby="line-cat-label"
              aria-required="true"
              aria-invalid={!!errors.cat || undefined}
              aria-describedby={errors.cat ? "line-cat-error" : undefined}
            >
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="line-cat-error" message={errors.cat} />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="line-desc" text="Description" />
          <Input
            id="line-desc"
            value={row.desc}
            placeholder="Describe this expense"
            onChange={(e) => onUpdate("desc", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="line-receipt-date" text="Date of Receipt" required />
          <DateField
            id="line-receipt-date"
            required
            value={row.receiptDate}
            onChange={(iso) => onUpdate("receiptDate", iso)}
            aria-invalid={!!errors.receiptDate || undefined}
            aria-describedby={
              errors.receiptDate ? "line-receipt-date-error" : undefined
            }
          />
          <FieldError id="line-receipt-date-error" message={errors.receiptDate} />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="line-qty" text="Quantity" />
          <Input
            id="line-qty"
            type="number"
            min={1}
            step={1}
            value={row.qty}
            onChange={(e) => onUpdate("qty", e.target.value)}
            className="font-mono"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel id="line-cur-label" text="Currency" required />
          <Select value={row.cur} onValueChange={(v) => onUpdate("cur", v)}>
            <SelectTrigger
              className="w-full bg-card"
              aria-labelledby="line-cur-label"
              aria-required="true"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="font-mono font-semibold">{c}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {CURRENCY_NAMES[c]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="line-amt" text="Amount" required />
          <Input
            id="line-amt"
            type="number"
            min={0}
            step={0.01}
            value={row.amt}
            placeholder="0.00"
            required
            aria-required="true"
            aria-invalid={!!errors.amt || undefined}
            aria-describedby={errors.amt ? "line-amt-error" : undefined}
            onChange={(e) => onUpdate("amt", e.target.value)}
            className="text-right font-mono"
          />
          <FieldError id="line-amt-error" message={errors.amt} />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border bg-muted/50 px-4 py-3">
        <span className="text-sm text-muted-foreground">Equivalent</span>
        <div className="text-right">
          <div className="font-mono text-base font-bold tabular-nums">
            SGD {fmt(sgd)}
          </div>
          {rateNote && (
            <div className="font-mono text-[11px] text-muted-foreground">
              {rateNote}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
