import { useCallback, useEffect, useRef, useState } from "react"
import { Eraser } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Draw-to-sign canvas. Pointer events cover mouse, touch and stylus in one
 * path; `touch-action: none` stops the browser treating a signing stroke as a
 * scroll gesture, which is what makes this usable on a phone.
 */
export function SignaturePad({
  onChange,
  disabled,
}: {
  /** Emits a PNG data URL, or "" once cleared. */
  onChange: (dataUrl: string) => void
  disabled?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  /* Size the backing store to the device pixel ratio so strokes aren't blurry
     on the phones this is most likely to be signed on. */
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    // Resizing clears the bitmap, so only do it when there's nothing to lose.
    if (canvas.width === rect.width * dpr && canvas.height === rect.height * dpr) return
    if (dirty.current) return
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#111111"
  }, [])

  useEffect(() => {
    fitCanvas()
    window.addEventListener("resize", fitCanvas)
    return () => window.removeEventListener("resize", fitCanvas)
  }, [fitCanvas])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    dirty.current = true
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasInk) setHasInk(true)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL("image/png"))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false
    setHasInk(false)
    onChange("")
    fitCanvas()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed bg-card">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label="Signature area. Draw your signature"
          role="img"
          className="block h-40 w-full touch-none"
          style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Sign here
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={disabled || !hasInk}
        >
          <Eraser className="size-3.5" />
          Clear
        </Button>
      </div>
    </div>
  )
}
