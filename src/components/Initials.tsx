import { cn } from "@/lib/utils"

/** Two-letter initials in a circle, so a person reads at a glance. */
export function Initials({ name, className }: { name: string; className?: string }) {
  const letters =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary-text",
        className,
      )}
    >
      {letters}
    </span>
  )
}
