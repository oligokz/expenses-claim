import React from "react"
import ReactDOM from "react-dom/client"
import { ThemeProvider } from "next-themes"
import App from "./App"
import { LegalPage } from "@/components/LegalPage"
import "./index.css"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

/* The legal pages are public: they render before, and without, sign-in. */
const path = window.location.pathname.replace(/\/+$/, "")
const legal = path === "/terms" ? "terms" : path === "/privacy" ? "privacy" : null

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Follows the device's light/dark setting until the user picks one in
        the user menu (desktop) or More (phone); the choice is remembered. */}
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={200}>
        {legal ? <LegalPage doc={legal} /> : <App />}
        {/* On a phone, keep toasts above the bottom nav and the expense form's
            Submit bar so an error never covers the button that caused it. */}
        <Toaster
          richColors
          position="bottom-right"
          closeButton
          mobileOffset={{
            bottom: "calc(var(--mobile-nav-h) + env(safe-area-inset-bottom) + 5.5rem)",
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
