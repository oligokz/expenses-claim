import { useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { SectionCard } from "@/components/SectionCard"
import { SignaturePad } from "@/components/SignaturePad"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { FieldLabel } from "@/components/FieldLabel"

import { fetchApproval, submitApproval } from "@/lib/api"
import type { ApprovalView } from "@/lib/types"

type Phase = "loading" | "ready" | "error" | "done"

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
        setError(e.message)
        setPhase("error")
      })
    return () => {
      alive = false
    }
  }, [token])

  const decide = async (decision: "approve" | "reject") => {
    // A signature is the point of the exercise on approval; a rejection just
    // needs a reason, so we don't demand one there.
    if (decision === "approve" && !signature) {
      toast.error("Please sign before approving")
      return
    }
    if (decision === "reject" && !comment.trim()) {
      toast.error("Please give a reason for rejecting")
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
            <p className="mt-1 text-sm text-muted-foreground">
              {approved
                ? outcome.complete
                  ? "This was the final approval. The requester has been notified."
                  : `Passed to ${outcome.nextApprover ?? "the next approver"} for final approval.`
                : "The requester has been notified."}
            </p>
            <div className="mt-5 w-full rounded-xl bg-surface-dark px-5 py-4 text-surface-dark-foreground">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-dark-muted">
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
          <Button variant="outline" size="sm" onClick={() => (window.location.href = "/")}>
            Go to the forms app
          </Button>
        </Card>
      </Shell>
    )
  }

  /* A spent link or an already-decided request is a state to explain, not an
     error to throw — the approver has done nothing wrong. */
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

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Approve purchase requisition
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.claimRef} · {view.stageLabel} · submitted by {view.requester}
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <SectionCard icon={<FileText />} title={view.title || "Request"}>
          <div className="flex flex-col gap-4">
            {view.description && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {view.description}
              </p>
            )}
            <table className="w-full text-sm">
              <tbody>
                {view.rows.map(([k, v]) => (
                  <tr key={k} className="border-b last:border-0">
                    <td className="py-2 pr-4 align-top text-muted-foreground">{k}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{v}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-4 align-top text-muted-foreground">Department</td>
                  <td className="py-2 text-right font-medium">{view.department}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard icon={<ThumbsUp />} title="Your decision">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="approval-comment" text="Comment" />
              <Textarea
                id="approval-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional when approving · required when rejecting"
                className="min-h-20 resize-y bg-card"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel id="signature-label" text="Signature" required />
              <SignaturePad onChange={setSignature} disabled={!!busy} />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="h-12 flex-1 text-sm font-semibold"
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
                className="h-12 flex-1 text-sm font-semibold text-destructive hover:text-destructive"
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

            <p className="text-xs leading-relaxed text-muted-foreground">
              Your approval is recorded against your signed-in account with a
              timestamp — that, not the drawing, is what proves who approved.
            </p>
          </div>
        </SectionCard>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
