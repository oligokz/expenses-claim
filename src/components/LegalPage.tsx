import { ArrowLeft } from "lucide-react"
import { LEGAL, LEGAL_UPDATED } from "@/lib/legal"

/** /terms and /privacy: readable without signing in, linked from the sign-in screen. */
export function LegalPage({ doc }: { doc: "terms" | "privacy" }) {
  const d = LEGAL[doc]
  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-surface-dark text-surface-dark-foreground">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4 sm:px-6">
          <a href="/" className="rounded outline-none focus-visible:ring-[3px] focus-visible:ring-white/40">
            <img src="/logo.svg" alt="CREOX Staff Portal" className="h-6 w-auto" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" />
          Back to the portal
        </a>

        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">{d.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-6 max-w-[65ch] leading-relaxed">{d.intro}</p>

        {d.sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="text-base font-semibold">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}

        <p className="mt-12 text-sm text-muted-foreground">
          See also the{" "}
          <a
            href={doc === "terms" ? "/privacy" : "/terms"}
            className="font-medium text-primary-text underline underline-offset-4 hover:no-underline"
          >
            {doc === "terms" ? LEGAL.privacy.title.toLowerCase() : LEGAL.terms.title.toLowerCase()}
          </a>
          .
        </p>
      </main>
    </div>
  )
}
