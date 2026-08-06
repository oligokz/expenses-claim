import { useCallback, useEffect, useRef } from "react"

/**
 * Signs the user out of the app after a period without interaction.
 *
 * Worth being clear about what this does and does not achieve. Clearing the
 * local session does not end the tenant SSO session, so MSAL can often
 * re-acquire silently and the user is back in without a prompt. Forcing real
 * re-authentication is Conditional Access sign-in frequency, which is an admin
 * control, not something an app can enforce.
 *
 * What this does buy is the thing that actually matters on an unattended
 * machine: the screen is cleared and continuing takes a deliberate action.
 */
export function useIdleTimeout({
  idleMs,
  warnMs,
  onWarn,
  onIdle,
  enabled = true,
}: {
  idleMs: number
  /** How long before the deadline to call onWarn. */
  warnMs: number
  onWarn: (reset: () => void) => void
  onIdle: () => void
  enabled?: boolean
}) {
  const warnTimer = useRef<number | undefined>(undefined)
  const idleTimer = useRef<number | undefined>(undefined)
  // Kept in refs so restarting the timers doesn't depend on caller memoisation.
  const onWarnRef = useRef(onWarn)
  const onIdleRef = useRef(onIdle)
  onWarnRef.current = onWarn
  onIdleRef.current = onIdle

  const clear = useCallback(() => {
    window.clearTimeout(warnTimer.current)
    window.clearTimeout(idleTimer.current)
  }, [])

  const start = useCallback(() => {
    clear()
    warnTimer.current = window.setTimeout(
      () => onWarnRef.current(start),
      Math.max(0, idleMs - warnMs),
    )
    idleTimer.current = window.setTimeout(() => onIdleRef.current(), idleMs)
  }, [clear, idleMs, warnMs])

  useEffect(() => {
    if (!enabled) {
      clear()
      return
    }

    /* Throttled: mousemove and scroll fire constantly, and resetting a pair of
       timers on every one of them is wasted work. One reset per second is
       plenty when the window is measured in minutes. */
    let last = 0
    const bump = () => {
      const now = Date.now()
      if (now - last < 1000) return
      last = now
      start()
    }

    const events: (keyof WindowEventMap)[] = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "wheel",
    ]
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))

    // Coming back to a backgrounded tab counts as activity; timers in a
    // throttled tab are unreliable, so re-arm rather than trust them.
    const onVisible = () => {
      if (document.visibilityState === "visible") start()
    }
    document.addEventListener("visibilitychange", onVisible)

    start()

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump))
      document.removeEventListener("visibilitychange", onVisible)
      clear()
    }
  }, [enabled, start, clear])

  return { reset: start, clear }
}
