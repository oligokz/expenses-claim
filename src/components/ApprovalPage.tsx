import { useEffect, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Paperclip,
  ThumbsDown,
  ThumbsUp,
  UserX,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { SectionCard } from "@/components/SectionCard"
import { SignaturePad } from "@/components/SignaturePad"
import { Timeline } from "@/components/Timeline"
import { Initials } from "@/components/Initials"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { FieldLabel } from "@/components/FieldLabel"

import { fetchApproval, NotYoursError, submitApproval } from "@/lib/api"
import { REQUISITION_OTHER } from "@/lib/constants"
import { fmt } from "@/lib/currency"
import type { ApprovalView, NotYoursInfo, RequisitionItem } from "@/lib/types"

type Phase = "loading" | "ready" | "error" | "done" | "notyours"

const shortDate = (s: string | null) =>
  s
    ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : ""

/** Bytes as a short human figure, so a receipt's weight reads at a glance. */
function fileSize(bytes: number): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Outcome {
  decision: string
  claimRef: string
  complete?: boolean
  nextApprover?: string | null
  pdfUrl?: string | null
}

export function ApprovalPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [view, setView] = useState<ApprovalView | null>(null)
  const [error, setError] = useState("")
  const [comment, setComment] = useState("")
  const [signature, setSignature] = useState("")
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [notYours, setNotYours] = useState<NotYoursInfo | null>(null)

  useEffect(() => {
    let alive = true
    fetchApproval(token)
      .then((v) => {
        if (!alive) return
        setView(v)
        setPhase("ready")
      })
      .catch((e: Error) => {
        if (!alive) return
        if (e instanceof NotYoursError) {
          setNotYours(e.info)
          setPhase("notyours")
          return
        }
        setError(e.message)
        setPhase("error")
      })
    return () => {
      alive = false
    }
  }, [token])

  const decide = async (decision: "approve" | "reject") => {
    // Only modules that ask for a drawing require one. A rejection never does;
    // it just needs a reason.
    if (decision === "approve" && view?.requiresSignature && !signature) {
      toast.error("Please sign before approving")
      return
    }
    if (decision === "reject" && !comment.trim()) {
      toast.error("Add a comment to say why you're rejecting it")
      return
    }

    setBusy(decision)
    try {
      const result = await submitApproval({
        token,
        decision,
        comment,
        signature: decision === "approve" ? signature : undefined,
      })
      setOutcome(result)
      setPhase("done")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  /* ── a link meant for someone else, usually a forwarded email ── */
  if (phase === "notyours" && notYours) {
    const n = notYours
    const pending = n.status.toLowerCase() === "pending"
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 p-6 text-center sm:p-8">
          <span className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
            <UserX className="size-6" />
          </span>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            {n.isRequester ? "This is your own request" : "This approval isn't for you"}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {n.isRequester
              ? "This link is for your approver, who has their own copy. No need to forward it."
              : "It was probably forwarded to you. Only the named approver can open it, so you don't need to do anything."}
          </p>
          <div className="mt-2 w-full max-w-sm rounded-xl border bg-muted/50 px-4 py-3 text-left text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono font-semibold tabular-nums">{n.claimRef}</span>
            </div>
            <div className="mt-1.5 flex justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              <span className="font-semibold">
                {pending && n.withName ? "Waiting for approval" : n.status}
              </span>
            </div>
            {pending && n.withName && (
              <div className="mt-1.5 flex justify-between gap-3">
                <span className="text-muted-foreground">With</span>
                <span className="text-right font-semibold">
                  {n.withName}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {n.withStage}
                    {n.since ? `, since ${shortDate(n.since)}` : ""}
                  </span>
                </span>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              (window.location.href = n.isRequester ? "/my-requests" : "/approvals")
            }
          >
            {n.isRequester ? "Go to my requests" : "Go to my approvals"}
          </Button>
        </Card>
      </Shell>
    )
  }

  /* ── outcome ── */
  if (phase === "done" && outcome) {
    const approved = outcome.decision === "approved"
    return (
      <Shell>
        <Card className="gap-0 p-6 text-center sm:p-7">
          <div className="flex flex-col items-center">
            <span
              className={
                approved
                  ? "grid size-12 place-items-center rounded-full bg-success/10 text-success"
                  : "grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"
              }
            >
              {approved ? (
                <CheckCircle2 className="size-6" />
              ) : (
                <XCircle className="size-6" />
              )}
            </span>
            <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">
              {approved ? "Approved" : "Rejected"}
            </h1>
            <div className="mt-5 w-full rounded-xl bg-surface-dark px-5 py-4 text-surface-dark-foreground">
              <div className="text-[11px] font-medium text-surface-dark-muted">
                Reference
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                {outcome.claimRef}
              </div>
            </div>
            {outcome.pdfUrl && (
              <Button
                size="lg"
                variant="outline"
                className="mt-5 h-12 w-full text-sm font-semibold"
                onClick={() => window.open(outcome.pdfUrl!, "_blank", "noopener")}
              >
                <FileText className="size-4" />
                Open the signed PDF
              </Button>
            )}
          </div>
        </Card>
      </Shell>
    )
  }

  if (phase === "loading") {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading the request…
        </div>
      </Shell>
    )
  }

  if (phase === "error" || !view) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => (window.location.href = "/approvals")}>
            Go to my approvals
          </Button>
        </Card>
      </Shell>
    )
  }

  /* A spent link or an already-decided request is a state to explain, not an
     error to throw, the approver has done nothing wrong. */
  if (!view.actionable) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <CheckCircle2 className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Nothing to do here</p>
          <p className="max-w-sm text-sm text-muted-foreground">{view.reason}</p>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums">
            {view.claimRef} · {view.status}
          </div>
        </Card>
      </Shell>
    )
  }

  /* The figure that matters most goes up top: the SGD total, or the days for
     leave. It is then left out of the details table so it isn't said twice. */
  const headline =
    view.rows.find(([, v]) => /^SGD /.test(v)) ||
    view.rows.find(([k]) => k === "Days")
  const headlineText = headline
    ? headline[0] === "Days"
      ? `${headline[1]} ${Number(headline[1]) === 1 ? "day" : "days"}`
      : headline[1]
    : ""
  const detailRows = view.rows.filter((r) => r !== headline)
  const step = view.stageLabel && view.stageLabel !== "Approver" ? view.stageLabel : ""
  const submitted = view.submittedOn
    ? new Date(view.submittedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : ""

  return (
    <Shell>
      <div className="mb-5">
        <p className="text-sm text-muted-foreground">
          {view.kind} · <span className="font-mono tabular-nums">{view.claimRef}</span>
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {view.title || view.kind}
        </h1>
        {step && (
          <span className="mt-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Your step: {step}
          </span>
        )}
      </div>

      {/* Who is asking and for how much, before anything else. */}
      <div className="mb-5 flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Initials name={view.requester} />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Submitted by</div>
            <div className="truncate text-base font-semibold">{view.requester}</div>
            <div className="truncate text-sm text-muted-foreground">
              {[view.department, submitted].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        {headlineText && (
          <div className="border-t pt-3 sm:border-0 sm:pt-0 sm:text-right">
            <div className="text-xs text-muted-foreground">{headline?.[0] === "Days" ? "Duration" : "Total"}</div>
            <div className="font-mono text-2xl font-bold tabular-nums">{headlineText}</div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <SectionCard icon={<FileText />} title="Details">
          <div className="flex flex-col gap-4">
            {view.description && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {view.description}
              </p>
            )}
            {view.items && view.items.length > 0 && (
              <ItemsTable items={view.items} currency={view.currency || "SGD"} />
            )}
            <table className="w-full text-sm">
              <tbody>
                {detailRows.map(([k, v]) => (
                  <tr key={k} className="border-b last:border-0">
                    <td className="py-2 pr-4 align-top text-muted-foreground">{k}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {view.attachments?.length > 0 && (
          <SectionCard
            icon={<Paperclip />}
            title={`Attachments (${view.attachments.length})`}
          >
            <ul className="flex flex-col gap-2">
              {view.attachments.map((a) => (
                <li key={a.name}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {a.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {fileSize(a.size)}
                    </span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {view.route && view.route.length > 1 && (
          <SectionCard icon={<ListChecks />} title="Progress">
            <Timeline steps={view.route} />
          </SectionCard>
        )}

        <SectionCard icon={<ThumbsUp />} title="Your decision">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="approval-comment" text="Comment" />
              <Textarea
                id="approval-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-20 resize-y bg-card"
              />
            </div>

            {view.requiresSignature && (
              <div className="flex flex-col gap-1.5">
                <FieldLabel id="signature-label" text="Signature" required />
                <SignaturePad onChange={setSignature} disabled={!!busy} />
              </div>
            )}

            {/* flex-1 only side by side: stacked on a phone it overrode the
                buttons' height and squashed them to their text. */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="h-12 w-full text-sm font-semibold sm:w-auto sm:flex-1"
                disabled={!!busy}
                onClick={() => decide("approve")}
              >
                {busy === "approve" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ThumbsUp className="size-4" />
                )}
                {busy === "approve" ? "Recording" : "Approve"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 w-full text-sm font-semibold text-destructive hover:text-destructive sm:w-auto sm:flex-1"
                disabled={!!busy}
                onClick={() => decide("reject")}
              >
                {busy === "reject" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ThumbsDown className="size-4" />
                )}
                {busy === "reject" ? "Recording" : "Reject"}
              </Button>
            </div>

          </div>
        </SectionCard>
      </div>
    </Shell>
  )
}

/** A requisition's line items, so the approver sees what each amount buys. */
function ItemsTable({
  items,
  currency,
}: {
  items: RequisitionItem[]
  currency: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Items requested</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-2 text-left font-medium">#</th>
            <th scope="col" className="py-2 pr-4 text-left font-medium">Item</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Qty</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium whitespace-nowrap">
              Unit ({currency})
            </th>
            <th scope="col" className="py-2 text-right font-medium whitespace-nowrap">
              Total ({currency})
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b align-top last:border-0">
              <td className="py-2 pr-2 text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="py-2 pr-4">
                <div className="font-medium">
                  {it.category === REQUISITION_OTHER && it.categoryOther
                    ? it.categoryOther
                    : it.category}
                </div>
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {it.description}
                </div>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{it.quantity}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{it.unitPrice == null ? "–" : fmt(it.unitPrice)}</td>
              <td className="py-2 text-right font-medium tabular-nums">{fmt(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* The page has no tab bar, so give approvers a way back to the rest of
            their queue rather than a dead end. */}
        <a
          href="/approvals"
          className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" />
          My approvals
        </a>
        {children}
      </main>
    </div>
  )
}
