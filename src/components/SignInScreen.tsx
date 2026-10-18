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
 * someone already known on this device. One card on the company navy from
 * creoxtech.com, which appears on this screen only; the action keeps the
 * app's blue.
 */
export function SignInScreen({
  heading = "Sign in to CREOX Staff Portal",
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
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#0a1f8f] px-4 py-[max(1.5rem,env(safe-area-inset-top))]">
      <main className="relative w-full max-w-[400px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
        <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow-[0_24px_60px_-20px_rgb(2_6_40/0.55)] sm:p-8">
          {/* The logo file is white; the light card shows it in ink. */}
          <img src="/logo.svg" alt="CREOX" className="h-6 w-auto invert dark:invert-0" />

          <h1 className="mt-8 text-balance font-display text-xl font-bold tracking-tight sm:text-2xl">
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

        <p className="mt-6 text-center text-xs text-white/75">CREOX Computing Singapore Pte. Ltd.</p>
      </main>
    </div>
  )
}
