import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SectionCardProps {
  icon: ReactNode
  title: string
  action?: ReactNode
  children: ReactNode
  /** Apply padding to the body. Disable for edge-to-edge content like tables. */
  bodyPadding?: boolean
  className?: string
  bodyClassName?: string
}

export function SectionCard({
  icon,
  title,
  action,
  children,
  bodyPadding = true,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground [&_svg]:size-3.5">
            {icon}
          </span>
          <h2 className="font-display text-sm font-semibold tracking-tight">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className={cn(bodyPadding && "p-5", bodyClassName)}>{children}</div>
    </Card>
  )
}
