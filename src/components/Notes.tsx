import { StickyNote } from "lucide-react"
import { SectionCard } from "@/components/SectionCard"
import { Textarea } from "@/components/ui/textarea"

interface NotesProps {
  value: string
  onChange: (value: string) => void
}

export function Notes({ value, onChange }: NotesProps) {
  return (
    <SectionCard icon={<StickyNote />} title="Additional Notes">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Additional notes"
        placeholder="Business purpose, trip details, or any additional context"
        className="min-h-24 resize-y bg-card"
      />
    </SectionCard>
  )
}
