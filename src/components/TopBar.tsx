import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TopBarProps {
  userName: string
  onLogout: () => void
}

export function TopBar({ userName, onLogout }: TopBarProps) {
  return (
    <header className="sticky top-0 z-50 bg-surface-dark text-surface-dark-foreground">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <img
          src="/logo.svg"
          alt="Company logo"
          className="h-6 w-auto sm:h-7"
        />

        <div className="flex items-center gap-2 sm:gap-3">
          {userName && (
            <span className="hidden max-w-[160px] truncate text-sm text-surface-dark-foreground/90 md:inline">
              {userName}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-surface-dark-muted hover:bg-white/10 hover:text-surface-dark-foreground"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
