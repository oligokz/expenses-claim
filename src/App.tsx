import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ClipboardCheck, Loader2, LogOut, Send } from "lucide-react"
import { toast } from "sonner"

import { TopBar } from "@/components/TopBar"
import {
  AppNav,
  VIEW_LABELS,
  VIEW_PATHS,
  viewFromPath,
  type View,
} from "@/components/AppNav"
import { MobileNav } from "@/components/MobileNav"
import { MyRequests } from "@/components/MyRequests"
import { Approvals } from "@/components/Approvals"
import { LeaveRequest } from "@/components/LeaveRequest"
import { TravelRequest } from "@/components/TravelRequest"
import { PurchaseRequisition } from "@/components/PurchaseRequisition"
import { ApprovalPage } from "@/components/ApprovalPage"
import { ClaimantInfo } from "@/components/ClaimantInfo"
import { LineItems } from "@/components/LineItems"
import { Receipts } from "@/components/Receipts"
import { Notes } from "@/components/Notes"
import { RatesPanel } from "@/components/RatesPanel"
import { ClaimSummary, type ClaimSummaryData } from "@/components/ClaimSummary"
import {
  ClaimConfirmation,
  type SubmitResult,
} from "@/components/ClaimConfirmation"
import { Button } from "@/components/ui/button"

import { clearSession, initAuth, logout } from "@/lib/auth"
import { useIdleTimeout } from "@/lib/useIdleTimeout"
import {
  fetchMyApprovals,
  fetchRates,
  submitClaim,
  uploadReceipt,
  type UploadMeta,
} from "@/lib/api"
import { fmt, num, toSGD } from "@/lib/currency"
import {
  FALLBACK_RATES,
  IDLE_TIMEOUT_MS,
  IDLE_WARN_MS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
} from "@/lib/constants"
import type {
  ClaimantForm,
  FormErrors,
  LineRow,
  RateStatus,
  Rates,
} from "@/lib/types"
import { cn } from "@/lib/utils"

type AuthState = "loading" | "ready" | "redirecting" | "error"

/** DOM ids for required controls, in document order, used to focus the first invalid field. */
const FIELD_IDS: Partial<Record<keyof FormErrors, string>> = {
  employee: "claimant-employee",
  dept: "claimant-dept",
  cat: "line-cat",
  receiptDate: "line-receipt-date",
  amt: "line-amt",
}
const FIELD_ORDER: (keyof FormErrors)[] = [
  "employee",
  "dept",
  "cat",
  "receiptDate",
  "amt",
]

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

let ROW_SEQ = 0
const newRow = (): LineRow => ({
  id: ++ROW_SEQ,
  cat: "",
  desc: "",
  receiptDate: "",
  qty: 1,
  cur: "SGD",
  amt: "",
})

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading")
  const [authError, setAuthError] = useState("")
  const [identityLocked, setIdentityLocked] = useState(false)
  const [userName, setUserName] = useState("")
  const [view, setViewState] = useState<View>(() =>
    viewFromPath(window.location.pathname),
  )

  /* Keep the address bar on the tab's own path, so a refresh, a bookmark or an
   * email link lands on the same page, and Back moves between tabs. */
  /* The page the rates table was opened from, so it can offer a way back. The
   * form keeps its values meanwhile: they live here, not in the form. Null when
   * /rates was opened directly. */
  const viewRef = useRef(view)
  viewRef.current = view
  const [ratesFrom, setRatesFrom] = useState<View | null>(null)

  const setView = useCallback((v: View) => {
    if (v === "rates" && viewRef.current !== "rates") setRatesFrom(viewRef.current)
    setViewState(v)
    if (window.location.pathname !== VIEW_PATHS[v]) {
      window.history.pushState(null, "", VIEW_PATHS[v])
    }
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const onPop = () => setViewState(viewFromPath(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const [claimant, setClaimant] = useState<ClaimantForm>({
    employee: "",
    email: "",
    dept: "",
    subDate: todayIso(),
  })
  // Exactly one expense entry per submission.
  const [row, setRow] = useState<LineRow>(newRow)
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState("")

  const [rates, setRates] = useState<Rates>({ SGD: 1 })
  const [rateStatus, setRateStatus] = useState<RateStatus>("connecting")
  const [rateUpdatedAt, setRateUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errors, setErrors] = useState<FormErrors>({})
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [idledOut, setIdledOut] = useState(false)

  const didInit = useRef(false)

  /* Clear a field's validation error as soon as the user edits it. */
  const clearError = useCallback((field: keyof FormErrors) => {
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  /* ── Expense entry ── */
  const updateRow = useCallback(
    <K extends keyof LineRow>(field: K, val: LineRow[K]) => {
      setRow((prev) => ({ ...prev, [field]: val }))
      if (field in FIELD_IDS) clearError(field as keyof FormErrors)
    },
    [clearError],
  )

  const updateClaimant = useCallback(
    <K extends keyof ClaimantForm>(field: K, val: ClaimantForm[K]) => {
      setClaimant((prev) => ({ ...prev, [field]: val }))
      if (field in FIELD_IDS) clearError(field as keyof FormErrors)
    },
    [clearError],
  )

  /* ── Files ── */
  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return
    const accepted: File[] = []
    Array.from(list).forEach((f) => {
      if (f.size > MAX_UPLOAD_BYTES) {
        toast.error(`${f.name}: exceeds ${MAX_UPLOAD_LABEL}`)
      } else {
        accepted.push(f)
      }
    })
    if (accepted.length) setFiles((prev) => [...prev, ...accepted])
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /* ── Rates ── */
  const loadRates = useCallback(async (notify = false) => {
    setRefreshing(true)
    const startedAt = Date.now()
    try {
      const r = await fetchRates()
      setRates(r)
      setRateStatus("live")
      setRateUpdatedAt(new Date())
      if (notify) toast.success("Exchange rates refreshed")
    } catch (e) {
      console.warn("Using cached rates:", (e as Error).message)
      setRates(FALLBACK_RATES)
      setRateStatus("cached")
      if (notify) toast.warning("Live rates unavailable - using cached rates")
    } finally {
      // Keep the spinner visible long enough to read as feedback.
      const elapsed = Date.now() - startedAt
      const wait = Math.max(0, 550 - elapsed)
      window.setTimeout(() => setRefreshing(false), wait)
    }
  }, [])

  /* ── Logout ── */
  const handleLogout = useCallback(() => {
    void logout()
  }, [])

  /* ── Init: auth + rates ── */
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    ;(async () => {
      try {
        const account = await initAuth()
        if (!account) {
          setAuthState("redirecting")
          return
        }
        setClaimant((prev) => ({
          ...prev,
          employee: account.name ?? "",
          email: account.username ?? "",
        }))
        setUserName(account.name ?? account.username ?? "")
        setIdentityLocked(true)
        setAuthState("ready")
        void loadRates(false)
      } catch (e) {
        console.error("Auth init failed", e)
        setAuthError((e as Error).message)
        setAuthState("error")
      }
    })()
  }, [loadRates])

  /* Sign out after a spell of inactivity. Covers the approval page too, since
   * that renders through here. */
  useIdleTimeout({
    idleMs: IDLE_TIMEOUT_MS,
    warnMs: IDLE_WARN_MS,
    enabled: authState === "ready" && !idledOut,
    onWarn: (reset) => {
      toast.warning("You will be signed out shortly", {
        description: "There has been no activity for a while.",
        duration: IDLE_WARN_MS,
        action: { label: "Stay signed in", onClick: reset },
      })
    },
    onIdle: () => {
      // Drop the local session and show a dead end rather than bouncing
      // straight back through SSO, which would sign most people in again
      // without a prompt and defeat the point.
      void clearSession()
      setIdledOut(true)
    },
  })

  /* How many requests are waiting on this person, for the banner and the tab
   * badge. An approver who arrives by any route, even a forwarded requester
   * email that opens the expense form (REQ-19), sees there is something to do.
   * Failing quietly is fine: the Approvals tab still lists them. */
  const [approvalsCount, setApprovalsCount] = useState(0)
  useEffect(() => {
    if (authState !== "ready" || window.location.pathname.startsWith("/approve")) return
    fetchMyApprovals()
      .then(({ approvals }) => setApprovalsCount(approvals.length))
      .catch(() => {})
  }, [authState])

  /* Refresh rates every 5 minutes once signed in. */
  useEffect(() => {
    if (authState !== "ready") return
    const id = window.setInterval(() => void loadRates(false), 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [authState, loadRates])

  /* ── Derived summary ── */
  const summary: ClaimSummaryData = useMemo(() => {
    const lineTotal = num(row.amt) * (num(row.qty) || 1)
    const total = toSGD(lineTotal, row.cur, rates)
    const hasAmount = lineTotal > 0
    return {
      itemCount: 1,
      currencies: hasAmount ? row.cur : "-",
      fileCount: files.length,
      total,
      breakdown: hasAmount ? `${row.cur} ${fmt(lineTotal)}` : "-",
    }
  }, [row, files, rates])

  /* ── Submit ── */
  const handleSubmit = useCallback(async () => {
    // Validate every required field at once so the user sees the full picture.
    const found: FormErrors = {}
    if (!claimant.employee) found.employee = "Enter the employee name"
    if (!claimant.dept) found.dept = "Select a department"
    if (!row.cat) found.cat = "Select an expense category"
    if (!row.receiptDate) found.receiptDate = "Choose the date on the receipt"
    if (!row.amt) found.amt = "Enter the expense amount"

    if (Object.keys(found).length > 0) {
      setErrors(found)
      toast.error("Please complete the highlighted fields")
      // Move focus to the first invalid control for keyboard / screen-reader users.
      const firstInvalid = FIELD_ORDER.find((f) => found[f])
      const focusId = firstInvalid ? FIELD_IDS[firstInvalid] : undefined
      if (focusId) {
        window.requestAnimationFrame(() => {
          document.getElementById(focusId)?.focus()
        })
      }
      return
    }
    setErrors({})

    // Capture the committed total now, before the form resets behind the confirmation.
    const totalSGD = toSGD(num(row.amt) * (num(row.qty) || 1), row.cur, rates)

    setSubmitting(true)
    setProgress(20)
    try {
      setProgress(35)
      const { claimRef } = await submitClaim({
        claimant,
        rows: [row],
        notes,
        receiptCount: files.length,
        rates,
      })
      setProgress(60)

      // Upload each receipt independently; track real per-file outcomes so we
      // never claim a receipt landed when it didn't.
      const failed: SubmitResult["failed"] = []
      for (let i = 0; i < files.length; i++) {
        setProgress(60 + Math.round((i / files.length) * 35))
        const meta: UploadMeta = {
          employeeName: claimant.employee,
          date: claimant.subDate,
          claimRef,
          index: i,
        }
        try {
          await uploadReceipt(files[i], meta)
        } catch (e) {
          console.warn(`Receipt "${files[i].name}" failed:`, (e as Error).message)
          failed.push({ file: files[i], meta })
        }
      }

      setProgress(100)
      if (failed.length === 0) {
        toast.success(`Submitted as ${claimRef}`)
      } else {
        toast.warning(
          `Submitted as ${claimRef}. ${failed.length} receipt(s) need a retry`,
        )
      }

      // Show a durable confirmation (proof-of-record) instead of a vanishing toast.
      setResult({
        claimRef,
        totalSGD,
        totalReceipts: files.length,
        uploadedReceipts: files.length - failed.length,
        failed,
      })

      // Reset the form behind the confirmation, keeping the verified identity.
      setRow(newRow())
      setFiles([])
      setNotes("")
      setClaimant((prev) => ({ ...prev, dept: "", subDate: todayIso() }))
    } catch (e) {
      console.error(e)
      toast.error(`Error: ${(e as Error).message}`)
    } finally {
      setSubmitting(false)
      window.setTimeout(() => setProgress(0), 1200)
    }
  }, [claimant, row, files, rates, notes])

  /* ── Retry failed receipt uploads from the confirmation screen ── */
  const handleRetryUploads = useCallback(async () => {
    if (!result || result.failed.length === 0 || retrying) return
    setRetrying(true)
    try {
      const stillFailed: SubmitResult["failed"] = []
      for (const item of result.failed) {
        try {
          await uploadReceipt(item.file, item.meta)
        } catch (e) {
          console.warn(`Retry failed for "${item.file.name}":`, (e as Error).message)
          stillFailed.push(item)
        }
      }
      const recovered = result.failed.length - stillFailed.length
      setResult((prev) =>
        prev
          ? {
              ...prev,
              uploadedReceipts: prev.uploadedReceipts + recovered,
              failed: stillFailed,
            }
          : prev,
      )
      if (stillFailed.length === 0) {
        toast.success("All receipts uploaded")
      } else {
        toast.warning(`${stillFailed.length} receipt(s) still failed to upload`)
      }
    } finally {
      setRetrying(false)
    }
  }, [result, retrying])

  /* ── Dismiss the confirmation and start a fresh claim ── */
  const handleNewClaim = useCallback(() => setResult(null), [])

  /* ── Approval deep link ──
   * vercel.json rewrites every non-/api path to index.html, so /approve is
   * handled here rather than by a router. Read after auth, because signing in
   * round-trips through Microsoft and auth.ts restores the path on the way back.
   */
  const approvalToken =
    window.location.pathname.replace(/\/+$/, "") === "/approve"
      ? new URLSearchParams(window.location.search).get("t")
      : null

  /* ── Idled out ── */
  if (idledOut) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
            <LogOut className="size-5" />
          </span>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Signed out
          </h1>
          <p className="text-sm text-muted-foreground">
            You were signed out after a period of inactivity. Nothing you
            submitted has been affected.
          </p>
          <Button className="mt-2" onClick={() => window.location.reload()}>
            Sign in again
          </Button>
        </div>
      </div>
    )
  }

  /* ── Non-ready states ── */
  if (authState !== "ready") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          {authState === "error" ? (
            <>
              <span className="text-sm font-semibold text-destructive">
                Sign-in failed
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">{authError}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {authState === "redirecting"
                  ? "Redirecting to Microsoft sign-in"
                  : "Signing you in"}
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (approvalToken) return <ApprovalPage token={approvalToken} />

  return (
    <div className="min-h-dvh bg-background">
      {/* Submit progress bar */}
      <div className="fixed inset-x-0 top-0 z-[60] h-0.5">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${progress}%`, opacity: progress ? 1 : 0 }}
        />
      </div>

      <TopBar
        userName={userName}
        onLogout={handleLogout}
        onViewRates={() => setView("rates")}
      />
      <AppNav view={view} onChange={setView} approvalsCount={approvalsCount} />
      <MobileNav
        view={view}
        onChange={setView}
        userName={userName}
        onLogout={handleLogout}
        approvalsCount={approvalsCount}
      />

      {/* On a phone, clear the bottom bar, plus the expense form's sticky
          Total/Submit bar where it sits on top of it. */}
      <main
        className={cn(
          "mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pb-8 sm:pt-8",
          view === "expense" && !result
            ? "pb-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom)+6.75rem)]"
            : "pb-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom)+2rem)]",
        )}
      >
        {approvalsCount > 0 && view !== "approvals" && (
          <button
            type="button"
            onClick={() => setView("approvals")}
            className="mx-auto mb-5 flex w-full max-w-2xl items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ClipboardCheck className="size-5 shrink-0 text-primary-text" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">
                {approvalsCount === 1
                  ? "1 request is waiting for your approval"
                  : `${approvalsCount} requests are waiting for your approval`}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-primary-text">Review</span>
          </button>
        )}

        {view === "expense" &&
          (result ? (
          <ClaimConfirmation
            result={result}
            retrying={retrying}
            onRetry={handleRetryUploads}
            onNewClaim={handleNewClaim}
          />
        ) : (
          /* One column, the same frame as the leave, travel and purchase forms.
             The rates sidebar used to give this page a layout of its own; the
             rate that matters is shown beside the amount, and the full table
             is its own page. */
          <div className="mx-auto max-w-2xl">
            <div className="mb-6">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                New Expense Claim
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Reimbursement for work expenses.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <ClaimantInfo
                value={claimant}
                onChange={updateClaimant}
                identityLocked={identityLocked}
                errors={errors}
              />
              <LineItems
                row={row}
                rates={rates}
                onUpdate={updateRow}
                errors={errors}
                onViewRates={() => setView("rates")}
              />
              <Receipts files={files} onAdd={addFiles} onRemove={removeFile} />
              <Notes value={notes} onChange={setNotes} />
              <ClaimSummary data={summary} />
              {/* On a phone the sticky bar below carries Submit instead. */}
              <Button
                size="lg"
                className="hidden h-12 w-full text-sm font-semibold sm:flex"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <Loader2 className={cn("size-4 animate-spin")} />
                ) : (
                  <Send className="size-4" />
                )}
                {submitting ? "Submitting" : "Submit Claim"}
              </Button>
            </div>

            {/* Mobile sticky action bar, keeps the total + Submit in the thumb
                zone. It sits on top of the bottom nav, which owns the
                safe-area inset. */}
            <div className="fixed inset-x-0 bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom))] z-40 border-t bg-card py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] shadow-[0_-2px_10px_rgba(0,0,0,0.06)] sm:hidden">
              <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Total (SGD)
                  </div>
                  <div className="truncate font-mono text-lg font-bold tabular-nums">
                    SGD {fmt(summary.total)}
                  </div>
                </div>
                <Button
                  size="lg"
                  className="h-12 min-w-[150px] max-w-[240px] flex-1 text-sm font-semibold"
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <Loader2 className={cn("size-4 animate-spin")} />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {submitting ? "Submitting" : "Submit Claim"}
                </Button>
              </div>
            </div>
          </div>
          ))}

        {view === "leave" && <LeaveRequest employeeName={userName} />}
        {view === "travel" && <TravelRequest employeeName={userName} />}
        {view === "requisition" && (
          <PurchaseRequisition employeeName={userName} rates={rates} />
        )}
        {view === "history" && <MyRequests />}
        {view === "approvals" && <Approvals onLoaded={setApprovalsCount} />}
        {view === "rates" && (
          <div className="mx-auto max-w-2xl">
            {/* Back through history when we came from inside the app, so the
                browser's Back and this link agree; otherwise to the form. */}
            <button
              type="button"
              onClick={() =>
                ratesFrom ? window.history.back() : setView("expense")
              }
              className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ArrowLeft className="size-4" />
              Back to {VIEW_LABELS[ratesFrom ?? "expense"]}
            </button>
            <div className="mb-6">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Exchange Rates
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Rates applied to claims at submission.
              </p>
            </div>
            <RatesPanel
              rates={rates}
              status={rateStatus}
              updatedAt={rateUpdatedAt}
              refreshing={refreshing}
              onRefresh={() => void loadRates(true)}
            />
          </div>
        )}
      </main>
    </div>
  )
}
