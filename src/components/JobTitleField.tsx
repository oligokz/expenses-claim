import { useEffect, useState } from "react"
import { Lock } from "lucide-react"
import { FieldLabel } from "@/components/FieldLabel"
import { Input } from "@/components/ui/input"
import { getProfileJobTitle } from "@/lib/auth"

/**
 * The signed-in person's job title from Microsoft 365, "" until known or if
 * unset. Pass `ready` false until sign-in finishes; the lookup waits for it.
 */
export function useProfileJobTitle(ready = true): string {
  const [title, setTitle] = useState("")
  useEffect(() => {
    if (!ready) return
    let live = true
    void getProfileJobTitle().then((t) => live && setTitle(t))
    return () => {
      live = false
    }
  }, [ready])
  return title
}

/**
 * Job title, locked to the Microsoft 365 profile like Name. Typed only when the
 * profile has none (or can't be read), so titles stay consistent across forms.
 */
export function JobTitleField({
  id,
  profileTitle,
  value,
  onChange,
  className,
}: {
  id: string
  profileTitle: string
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className={className ?? "flex flex-col gap-1.5"}>
      <FieldLabel htmlFor={id} text="Job title" />
      {profileTitle ? (
        <div className="relative">
          <Input id={id} value={profileTitle} readOnly className="bg-muted pr-9" />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="bg-card" />
      )}
    </div>
  )
}
