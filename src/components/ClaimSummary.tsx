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
      <Row label="Line Items" value={data.itemCount} />
      <Row label="Currencies" value={data.currencies} />
      <Row label="Receipts" value={data.fileCount} />

      <div className="mt-3 rounded-xl bg-surface-dark px-4 py-3.5 text-surface-dark-foreground">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-dark-muted">
          Total Claim (SGD)
        </div>
        <div className="mt-1 font-mono text-2xl font-bold leading-none tabular-nums">
          SGD {fmt(data.total)}
        </div>
        <div className="mt-1.5 break-all font-mono text-[11px] text-surface-dark-muted">
          {data.breakdown}
        </div>
      </div>
    </SectionCard>
  )
}
