import { Receipt } from "lucide-react"
import { SectionCard } from "@/components/SectionCard"
import { fmt } from "@/lib/currency"

export interface ClaimSummaryData {
  itemCount: number
  currencies: string
  fileCount: number
  total: number
  breakdown: string
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">
        {value}
      </span>
    </div>
  )
}

export function ClaimSummary({ data }: { data: ClaimSummaryData }) {
  return (
    <SectionCard icon={<Receipt />} title="Claim Summary">
      {/* A claim is one expense, so a "Line Items: 1" row said nothing. */}
      <Row label="Currency" value={data.currencies} />
      <Row label="Receipts" value={data.fileCount} />

      <div className="mt-4 rounded-xl border bg-muted/50 px-5 py-6">
        <div className="text-xs font-medium text-muted-foreground">
          Total claim
        </div>
        <div className="mt-2 font-mono text-2xl font-bold leading-tight tabular-nums text-destructive">
          SGD {fmt(data.total)}
        </div>
        {data.breakdown && data.breakdown !== "-" && (
          <div className="mt-2 break-all font-mono text-xs text-muted-foreground">
            {data.breakdown}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
