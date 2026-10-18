import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Microsoft's four-square mark, drawn at its published proportions. */
function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" className="size-[18px] shrink-0">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

/**
 * The front door: shown on a first visit and after signing out, never to
 * someone already known on this device. The navy band is the company's own
 * (creoxtech.com) and appears on this screen only; the action keeps the app's
 * blue.
 */
export function SignInScreen({
  heading = "CREOX Staff Portal",
  message = "Expense claims, leave, travel and purchase requests.",
  onSignIn,
}: {
  heading?: string
  message?: string
  onSignIn: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    try {
      await onSignIn()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-1">
      {/* Brand band: top of the phone screen, the left half on a desktop. */}
      <div className="relative flex min-h-[46dvh] items-end bg-[#0a1f8f] px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-10 lg:min-h-dvh lg:items-center lg:px-16">
        <div className="relative w-fit p-4">
          {/* Corner brackets, as around the company line on creoxtech.com. */}
          <span aria-hidden="true" className="absolute left-0 top-0 size-3 border-l border-t border-white/50" />
          <span aria-hidden="true" className="absolute right-0 top-0 size-3 border-r border-t border-white/50" />
          <span aria-hidden="true" className="absolute bottom-0 left-0 size-3 border-b border-l border-white/50" />
          <span aria-hidden="true" className="absolute bottom-0 right-0 size-3 border-b border-r border-white/50" />
          <img src="/logo.svg" alt="CREOX" className="h-9 w-auto sm:h-11 lg:h-14" />
        </div>
      </div>

      <main className="relative flex flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10 sm:px-10 lg:justify-center lg:px-16">
        <div className="w-full max-w-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <h1 className="text-balance font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {heading}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>

          <Button
            size="lg"
            className="mt-8 h-12 w-full gap-3 text-sm font-semibold"
            disabled={busy}
            onClick={start}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <span className="grid size-6 place-items-center rounded-[5px] bg-white">
                <MicrosoftMark />
              </span>
            )}
            {busy ? "Opening Microsoft sign-in" : "Sign in with Microsoft"}
          </Button>
        </div>

        <p className="mt-auto pt-12 text-xs text-muted-foreground lg:absolute lg:bottom-8 lg:pt-0">
          CREOX Computing Singapore Pte. Ltd.
        </p>
      </main>
    </div>
  )
}
