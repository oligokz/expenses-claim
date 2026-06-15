import * as React from "react"
import { CalendarDays } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface DateFieldProps
  extends Omit<React.ComponentProps<typeof Input>, "onChange" | "value" | "type"> {
  /** ISO yyyy-mm-dd, or "" when unset */
  value: string
  onChange: (iso: string) => void
}

/** ISO yyyy-mm-dd → dd/mm/yyyy for display. */
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ""
}

/** Keep only digits and re-insert slashes as the user types: dd/mm/yyyy. */
function maskDisplay(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("/")
}

/** dd/mm/yyyy → ISO yyyy-mm-dd, or "" if incomplete/not a real calendar date. */
function displayToIso(display: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display)
  if (!m) return ""
  const [, dd, mm, yyyy] = m
  const d = Number(dd)
  const mo = Number(mm)
  const y = Number(yyyy)
  const dt = new Date(y, mo - 1, d)
  // Reject impossible dates (e.g. 31/02/2026 rolling over).
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return ""
  }
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Date input that displays and accepts dd/mm/yyyy, while emitting ISO
 * (yyyy-mm-dd) to the form. A calendar button opens the native picker for
 * point-and-click; typing stays available for speed.
 */
export function DateField({
  value,
  onChange,
  className,
  required,
  ...props
}: DateFieldProps) {
  const [display, setDisplay] = React.useState(() => isoToDisplay(value))
  const pickerRef = React.useRef<HTMLInputElement>(null)

  // Keep the text in sync when the value changes externally (reset, default today).
  React.useEffect(() => {
    setDisplay(isoToDisplay(value))
  }, [value])

  const handleText = (raw: string) => {
    const next = maskDisplay(raw)
    setDisplay(next)
    onChange(displayToIso(next))
  }

  const openPicker = () => {
    try {
      pickerRef.current?.showPicker?.()
    } catch {
      /* unsupported — typing still works */
    }
  }

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        value={display}
        required={required}
        aria-required={required || undefined}
        onChange={(e) => handleText(e.target.value)}
        onClick={openPicker}
        className={cn("bg-card pr-9", className)}
      />
      <button
        type="button"
        aria-label="Open calendar"
        onClick={openPicker}
        className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <CalendarDays className="size-4" />
      </button>
      {/* Hidden native picker — provides the calendar popup; value stays ISO. */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 right-2 size-0 opacity-0"
      />
    </div>
  )
}
