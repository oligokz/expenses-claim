import { ChevronsUpDown, LogOut } from "lucide-react"
import { DropdownMenu } from "radix-ui"

interface TopBarProps {
  userName: string
  onLogout: () => void
}

/** "Bernard Lim" → "BL"; single name → first two letters. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function TopBar({ userName, onLogout }: TopBarProps) {
  return (
    <header className="sticky top-0 z-50 bg-surface-dark text-surface-dark-foreground">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <img src="/logo.svg" alt="Company logo" className="h-6 w-auto sm:h-7" />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 outline-none transition-colors hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/40">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-semibold">
              {initials(userName)}
            </span>
            {userName && (
              <span className="hidden max-w-[160px] truncate text-sm font-medium md:inline">
                {userName}
              </span>
            )}
            <ChevronsUpDown
              aria-hidden="true"
              className="size-4 shrink-0 text-surface-dark-muted"
            />
            <span className="sr-only">Open user menu</span>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-[70] min-w-[200px] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
            >
              <div className="truncate px-2 py-1.5 text-sm font-medium">
                {userName || "Signed in"}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={() => onLogout()}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
