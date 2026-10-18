import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export const THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const

/**
 * Three-way System / Light / Dark switch for the phone's More sheet. A radio
 * group so a screen reader announces it as one choice, laid out as a segmented
 * control so every option is a full-height tap target.
 */
export function ThemeSegmented() {
  const { theme = "system", setTheme } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="grid grid-cols-3 gap-1 rounded-lg border bg-secondary p-1"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const on = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(value)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-md text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
              on
                // The same raised white-on-grey (card-on-secondary) in both
                // themes; the navy accent in dark mode barely stood out.
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
