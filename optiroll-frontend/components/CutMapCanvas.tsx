'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Sheet } from '@/types'
import { ZoomIn, ZoomOut, Download, Eye, EyeOff, Maximize2, Minimize2, History, FileDown } from 'lucide-react'

interface Props {
  sheet: Sheet
  /** Full roll length (m) for fresh rolls — used to compute the tail-saved-as-leftover figure */
  maxRollLength?: number
}

const fmtRollWidth = (v: number) => `${v.toFixed(3).replace(/\.?0+$/, '')}m`

// Word-wrap `text` to fit within `maxWidth` px on the current canvas context.
// Breaks on whitespace first; if a single word is itself longer than maxWidth,
// splits it character-by-character so it still fits. Returns the resulting lines.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return []
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  const pushBrokenWord = (word: string) => {
    let buf = ''
    for (const ch of word) {
      const cand = buf + ch
      if (ctx.measureText(cand).width <= maxWidth) {
        buf = cand
      } else {
        if (buf) lines.push(buf)
        buf = ch
      }
    }
    if (buf) current = buf
  }
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      if (current) { lines.push(current); current = '' }
      if (ctx.measureText(word).width <= maxWidth) {
        current = word
      } else {
        pushBrokenWord(word)
      }
    }
  }
  if (current) lines.push(current)
  return lines
}

// Truncate `text` with an ellipsis so it fits within `maxWidth` on the current ctx.
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text || ctx.measureText(text).width <= maxWidth) return text
  const ellipsis = '…'
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo) + ellipsis
}

// Returns true when a waste rectangle qualifies as a reusable leftover
// (matches one of the rects the optimiser saved back to inventory).
function isReusableRect(
  w: { x: number; y: number; width: number; height: number },
  reusables: Sheet['reusable_leftovers']
) {
  const TOL = 0.005
  return reusables.some(r =>
    Math.abs(r.x - w.x) < TOL &&
    Math.abs(r.y - w.y) < TOL &&
    Math.abs(r.width - w.width) < TOL &&
    Math.abs(r.height - w.height) < TOL
  )
}

// Renders the cut map to a canvas context. Pure function — no side effects.
function renderCutMap(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  scale: number,
  showLabels: boolean,
  showPrevious: boolean,
  MARGIN: number,
  TOPBAR: number,
  maxRollLength?: number
) {
  const isLeftover = sheet.sheet_type === 'leftover'
  const hasPrevious = isLeftover && sheet.previous_blinds && sheet.previous_blinds.length > 0
  const canvasWidth  = (isLeftover && sheet.original_width  > 0) ? sheet.original_width  : sheet.width
  const canvasLength = (isLeftover && sheet.original_length > 0) ? sheet.original_length : sheet.length
  const offX = isLeftover ? sheet.leftover_offset_x : 0
  const offY = isLeftover ? sheet.leftover_offset_y : 0

  const sw = canvasWidth * scale
  const sh = canvasLength * scale
  const cw = sw + MARGIN * 2
  const ch = sh + MARGIN * 2 + TOPBAR

  ctx.canvas.width  = cw
  ctx.canvas.height = ch

  // Background
  ctx.fillStyle = '#f8f9fc'
  ctx.fillRect(0, 0, cw, ch)

  // Top bar
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(0, 0, cw, TOPBAR)
  ctx.fillStyle = '#e2e6f0'
  ctx.font = 'bold 13px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // Compute breakdown: within-cut areas split into Pieces / Reusable / Trim
  const cutArea = sheet.width * sheet.length
  const reusableArea = (sheet.reusable_leftovers || []).reduce((s, r) => s + r.width * r.height, 0)
  const totalWasteArea = (sheet.waste_areas || []).reduce((s, w) => s + w.width * w.height, 0)
  const trimArea = Math.max(0, totalWasteArea - reusableArea)
  const reusablePct = cutArea > 0 ? (reusableArea / cutArea) * 100 : 0
  const trimPct = cutArea > 0 ? (trimArea / cutArea) * 100 : 0

  // Tail of fresh roll that wasn't cut — automatically saved as leftover by the optimiser
  const tailLength = (!isLeftover && maxRollLength && maxRollLength > sheet.length)
    ? maxRollLength - sheet.length
    : 0
  const tailArea = tailLength * sheet.width

  if (isLeftover && hasPrevious) {
    ctx.fillText(
      `Sheet #${sheet.sheet_number}  ·  Reused Leftover  ·  Original: ${fmtRollWidth(canvasWidth)} × ${canvasLength.toFixed(2)}m`,
      MARGIN, 20
    )
    ctx.fillStyle = '#9aa3b8'
    ctx.font = '12px Inter, sans-serif'
    ctx.fillText(
      `Util ${sheet.utilization}%  ·  Reusable ${reusablePct.toFixed(1)}%  ·  Trim ${trimPct.toFixed(1)}%  ·  ${sheet.blinds.length} pieces`,
      MARGIN, 44
    )
  } else {
    ctx.fillText(
      `Sheet #${sheet.sheet_number}  ·  Fresh Roll  ·  ${fmtRollWidth(sheet.width)} × ${sheet.length.toFixed(2)}m`,
      MARGIN, 20
    )
    ctx.fillStyle = '#9aa3b8'
    ctx.font = '12px Inter, sans-serif'
    const tailLabel = tailLength > 0
      ? `  ·  +${tailLength.toFixed(2)}m tail saved as leftover (${tailArea.toFixed(2)}m²)`
      : ''
    ctx.fillText(
      `Util ${sheet.utilization}%  ·  Reusable ${reusablePct.toFixed(1)}%  ·  Trim ${trimPct.toFixed(1)}%  ·  ${sheet.blinds.length} pieces${tailLabel}`,
      MARGIN, 44
    )
  }

  // Sheet background
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#c8cdd9'
  ctx.lineWidth = 1.5
  ctx.fillRect(MARGIN, MARGIN + TOPBAR, sw, sh)
  ctx.strokeRect(MARGIN, MARGIN + TOPBAR, sw, sh)

  // Grid
  ctx.strokeStyle = '#e8ebf2'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= Math.floor(canvasWidth); i++) {
    const x = MARGIN + i * scale
    ctx.beginPath(); ctx.moveTo(x, MARGIN + TOPBAR); ctx.lineTo(x, MARGIN + TOPBAR + sh); ctx.stroke()
  }
  for (let i = 0; i <= Math.ceil(canvasLength); i++) {
    const y = MARGIN + TOPBAR + i * scale
    ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(MARGIN + sw, y); ctx.stroke()
  }

  // Leftover zone highlight
  if (isLeftover && hasPrevious) {
    const zx = MARGIN + offX * scale
    const zy = MARGIN + TOPBAR + offY * scale
    const zw = sheet.width * scale
    const zh = sheet.length * scale
    ctx.fillStyle = 'rgba(16, 185, 129, 0.06)'
    ctx.fillRect(zx, zy, zw, zh)
    ctx.strokeStyle = '#10b981'
    ctx.setLineDash([8, 4])
    ctx.lineWidth = 2.5
    ctx.strokeRect(zx, zy, zw, zh)
    ctx.setLineDash([])
    ctx.fillStyle = '#10b981'
    ctx.font = 'bold 11px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('▶ REUSABLE ZONE ◀', zx + 8, zy + 8)
  }

  // Previous cuts (ghosted)
  if (showPrevious && hasPrevious) {
    for (const b of sheet.previous_blinds) {
      const bx = MARGIN + b.x * scale
      const by = MARGIN + TOPBAR + b.y * scale
      const bw = b.width * scale
      const bh = b.height * scale
      if (bx + bw < MARGIN || bx > MARGIN + sw || by + bh < MARGIN + TOPBAR || by > MARGIN + TOPBAR + sh) continue
      ctx.fillStyle = 'rgba(148, 163, 184, 0.12)'
      ctx.fillRect(bx, by, bw, bh)
      ctx.save()
      ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'
      ctx.lineWidth = 1
      for (let i = -bh; i < bw + bh; i += 10) {
        ctx.beginPath(); ctx.moveTo(bx + i, by); ctx.lineTo(bx + i - bh, by + bh); ctx.stroke()
      }
      ctx.restore()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1
      ctx.strokeRect(bx, by, bw, bh)
      ctx.setLineDash([])
      if (showLabels && bw > 40 && bh > 24) {
        ctx.fillStyle = '#64748b'
        ctx.font = 'bold 9px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('PREVIOUS', bx + bw / 2, by + bh / 2 - 6)
        ctx.font = '8px Inter, sans-serif'
        ctx.fillText(`${(b.width / 0.0254).toFixed(5)}"×${(b.height / 0.0254).toFixed(5)}"`, bx + bw / 2, by + bh / 2 + 6)
      }
    }
  }

  // Waste areas — distinguish reusable (teal, saved as leftover) from trim (pink, true waste)
  const reusableRects = sheet.reusable_leftovers || []
  for (const w of sheet.waste_areas) {
    const wx = MARGIN + (w.x + offX) * scale
    const wy = MARGIN + TOPBAR + (w.y + offY) * scale
    const ww = w.width * scale
    const wh = w.height * scale
    const reusable = isReusableRect(w, reusableRects)
    if (reusable) {
      ctx.fillStyle = 'rgba(20, 184, 166, 0.12)'
      ctx.fillRect(wx, wy, ww, wh)
      ctx.strokeStyle = '#5eead4'
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.2
      ctx.strokeRect(wx, wy, ww, wh)
      ctx.setLineDash([])
      if (showLabels && ww > 50 && wh > 24) {
        ctx.fillStyle = '#0d9488'
        ctx.font = 'bold 10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('REUSABLE', wx + ww / 2, wy + wh / 2 - 5)
        ctx.font = '9px Inter, sans-serif'
        ctx.fillStyle = '#14b8a6'
        ctx.fillText(`→ leftover`, wx + ww / 2, wy + wh / 2 + 7)
      }
    } else {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)'
      ctx.fillRect(wx, wy, ww, wh)
      ctx.strokeStyle = '#fca5a5'
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.2
      ctx.strokeRect(wx, wy, ww, wh)
      ctx.setLineDash([])
      if (showLabels && ww > 35 && wh > 20) {
        ctx.fillStyle = '#ef4444'
        ctx.font = 'bold 10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('TRIM', wx + ww / 2, wy + wh / 2)
      }
    }
  }

  // Current blinds with detailed labels
  for (const b of sheet.blinds) {
    const bx = MARGIN + (b.x + offX) * scale
    const by = MARGIN + TOPBAR + (b.y + offY) * scale
    const bw = b.width * scale
    const bh = b.height * scale
    const isZebra = b.blind_type === 'zebra'

    ctx.fillStyle = isZebra ? 'rgba(139, 92, 246, 0.9)' : 'rgba(37, 99, 235, 0.9)'
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(bx, by, bw, bh)

    if (showLabels) {
      const M_TO_IN = 1 / 0.0254
      const typeLabel = isZebra ? 'ZEBRA' : 'ROLLER'
      const valenceIn = b.valence !== undefined ? (b.valence * M_TO_IN).toFixed(5) : null
      const cutLen    = (b.height * M_TO_IN).toFixed(5)
      const wLabel    = `${(b.width * M_TO_IN).toFixed(5)}"`

      const fs = Math.min(12, Math.max(7, bw / 10))
      const PAD = 6  // px padding inside the rectangle for text
      const textMaxWidth = Math.max(10, bw - PAD * 2)

      // Clip every label to the piece's rectangle so long shade names can never
      // bleed outside its bounds — wrapping handles the in-bounds layout below.
      ctx.save()
      ctx.beginPath()
      ctx.rect(bx, by, bw, bh)
      ctx.clip()

      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      if (bh > 80 && bw > 60) {
        const shadeFs = Math.min(fs + 1, 13)
        ctx.font = `bold ${shadeFs}px Inter, sans-serif`
        const shadeLines = b.shade_number ? wrapText(ctx, b.shade_number, textMaxWidth) : []

        const lineCount = shadeLines.length + 1 + 1 + (valenceIn ? 1 : 0) + (b.rotated ? 1 : 0)
        let lineY = by + bh / 2 - ((lineCount - 1) / 2) * (fs + 3)

        if (shadeLines.length > 0) {
          ctx.font = `bold ${shadeFs}px Inter, sans-serif`
          ctx.fillStyle = '#ffffff'
          for (const line of shadeLines) {
            ctx.fillText(line, bx + bw / 2, lineY)
            lineY += shadeFs + 2
          }
          lineY += 2  // small gap after the shade block
        }

        ctx.font = `bold ${fs}px Inter, sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.fillText(`${wLabel} × ${cutLen}"`, bx + bw / 2, lineY)
        lineY += fs + 3

        ctx.font = `${fs - 1}px Inter, sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(typeLabel, bx + bw / 2, lineY)
        lineY += fs + 2

        if (valenceIn) {
          ctx.font = `${fs - 1}px Inter, sans-serif`
          ctx.fillStyle = 'rgba(255,255,255,0.75)'
          ctx.fillText(`Val: ${valenceIn}"`, bx + bw / 2, lineY)
          lineY += fs + 2
        }

        if (b.rotated) {
          ctx.font = `${fs - 2}px Inter, sans-serif`
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.fillText('↻ 90°', bx + bw / 2, lineY)
        }
      } else if (bh > 36 && bw > 40) {
        ctx.font = `bold ${fs}px Inter, sans-serif`
        ctx.fillStyle = '#ffffff'
        const dimLine = `${wLabel} × ${cutLen}"`
        const shadeText = b.shade_number
          ? ellipsize(ctx, b.shade_number, textMaxWidth)
          : ellipsize(ctx, dimLine, textMaxWidth)
        ctx.fillText(shadeText, bx + bw / 2, by + bh / 2 - fs / 2 - 2)
        ctx.font = `${fs - 1}px Inter, sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        const subText = b.shade_number ? dimLine : typeLabel
        ctx.fillText(ellipsize(ctx, subText, textMaxWidth), bx + bw / 2, by + bh / 2 + fs / 2 + 2)
      } else if (bh > 18 || bw > 30) {
        ctx.font = `bold ${Math.max(fs - 1, 7)}px Inter, sans-serif`
        ctx.fillStyle = '#ffffff'
        const text = b.shade_number || typeLabel
        ctx.fillText(ellipsize(ctx, text, textMaxWidth), bx + bw / 2, by + bh / 2)
      }

      ctx.restore()
    }
  }

  // Axis labels
  ctx.fillStyle = '#8b93a7'
  ctx.font = '11px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('0', MARGIN, TOPBAR + MARGIN - 8)
  ctx.fillText(fmtRollWidth(canvasWidth), MARGIN + sw, TOPBAR + MARGIN - 8)
  ctx.textAlign = 'right'
  ctx.fillText('0', MARGIN - 8, TOPBAR + MARGIN + 12)
  ctx.fillText(`${canvasLength.toFixed(2)}m`, MARGIN - 8, TOPBAR + MARGIN + sh - 6)
}

const MARGIN = 60
const TOPBAR = 64

export default function CutMapCanvas({ sheet, maxRollLength }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(140)
  const [showLabels, setShowLabels] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [showPrevious, setShowPrevious] = useState(true)

  const isLeftover = sheet.sheet_type === 'leftover'
  const hasPrevious = isLeftover && sheet.previous_blinds && sheet.previous_blinds.length > 0

  const canvasWidth  = (isLeftover && sheet.original_width  > 0) ? sheet.original_width  : sheet.width
  const canvasLength = (isLeftover && sheet.original_length > 0) ? sheet.original_length : sheet.length
  const offX = isLeftover ? sheet.leftover_offset_x : 0
  const offY = isLeftover ? sheet.leftover_offset_y : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderCutMap(ctx, sheet, scale, showLabels, showPrevious, MARGIN, TOPBAR, maxRollLength)
  }, [sheet, scale, showLabels, showPrevious, canvasWidth, canvasLength, offX, offY, hasPrevious, isLeftover, maxRollLength])

  // Standard PNG download — renders at 200px/m so it's always crisp regardless of zoom.
  const download = useCallback(() => {
    const DL_SCALE = 200
    const offscreen = document.createElement('canvas')
    const ctx = offscreen.getContext('2d')
    if (!ctx) return
    renderCutMap(ctx, sheet, DL_SCALE, true, showPrevious, MARGIN, TOPBAR, maxRollLength)
    const a = document.createElement('a')
    a.download = `sheet-${sheet.sheet_number}.png`
    a.href = offscreen.toDataURL('image/png')
    a.click()
  }, [sheet, showPrevious, maxRollLength])

  // A3 PNG download — 1748×2480px (portrait, 150 DPI)
  const downloadA3 = useCallback(() => {
    const A3_W_PX = 1748
    const A3_H_PX = 2480
    const MARGIN_A3 = 80
    const TOPBAR_A3 = 90
    const FOOTER_H  = 50

    const contentW = A3_W_PX - MARGIN_A3 * 2
    const contentH = A3_H_PX - MARGIN_A3 * 2 - TOPBAR_A3 - FOOTER_H

    const a3Scale = Math.min(contentW / canvasWidth, contentH / canvasLength)

    // Step 1 — render cut map to an inner canvas (renderCutMap sets its own size).
    const inner = document.createElement('canvas')
    const innerCtx = inner.getContext('2d')
    if (!innerCtx) return
    renderCutMap(innerCtx, sheet, a3Scale, true, showPrevious, MARGIN_A3, TOPBAR_A3, maxRollLength)
    // inner.width may be narrower than A3_W_PX for narrow rolls — that's fine.

    // Step 2 — stamp inner canvas onto a proper 1748×2480 A3 canvas, centred.
    const a3 = document.createElement('canvas')
    a3.width  = A3_W_PX
    a3.height = A3_H_PX
    const ctx = a3.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, A3_W_PX, A3_H_PX)

    // Centre the content horizontally; top-align with small top padding.
    const drawX = Math.max(0, Math.round((A3_W_PX - inner.width) / 2))
    ctx.drawImage(inner, drawX, 0)

    // Border frame
    ctx.strokeStyle = '#c8cdd9'
    ctx.lineWidth = 3
    ctx.strokeRect(20, 20, A3_W_PX - 40, A3_H_PX - 40)

    // Footer bar
    ctx.fillStyle = '#1a1f2e'
    ctx.fillRect(20, A3_H_PX - FOOTER_H - 4, A3_W_PX - 40, FOOTER_H)
    ctx.fillStyle = '#e2e6f0'
    ctx.font = 'bold 16px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const reusableA = (sheet.reusable_leftovers || []).reduce((s, r) => s + r.width * r.height, 0)
    const totalWasteA = (sheet.waste_areas || []).reduce((s, w) => s + w.width * w.height, 0)
    const trimA = Math.max(0, totalWasteA - reusableA)
    const cutA = sheet.width * sheet.length
    const reusablePctA = cutA > 0 ? (reusableA / cutA) * 100 : 0
    const trimPctA = cutA > 0 ? (trimA / cutA) * 100 : 0
    ctx.fillText(
      `OptiRoll  ·  Sheet #${sheet.sheet_number}  ·  Roll ${fmtRollWidth(sheet.width)} × ${sheet.length.toFixed(2)}m used  ·  Util ${sheet.utilization}%  ·  Reusable ${reusablePctA.toFixed(1)}%  ·  Trim ${trimPctA.toFixed(1)}%`,
      A3_W_PX / 2, A3_H_PX - FOOTER_H / 2 - 4
    )

    const a = document.createElement('a')
    a.download = `sheet-${sheet.sheet_number}-A3.png`
    a.href = a3.toDataURL('image/png')
    a.click()
  }, [sheet, canvasWidth, canvasLength, showPrevious, maxRollLength])

  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-surface-900/95 flex flex-col items-center justify-center p-4' : ''}`}>
      <div className={`${fullscreen ? 'w-full max-w-6xl' : 'panel overflow-hidden'}`}>
        <div className={`${fullscreen ? 'bg-surface-0 rounded-xl shadow-2xl overflow-hidden' : ''}`}>
          <div className="panel-header flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-surface-800">Sheet #{sheet.sheet_number}</span>
              <span className={`badge ${isLeftover ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                {isLeftover ? 'LEFTOVER REUSED' : 'FRESH ROLL'}
              </span>
              {isLeftover && (
                <span className="text-xs text-amber-600 font-medium">
                  ← Original: {fmtRollWidth(sheet.original_width || 0)} × {sheet.original_length?.toFixed(2)}m
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasPrevious && (
                <button
                  onClick={() => setShowPrevious(!showPrevious)}
                  className={`btn-ghost p-1.5 ${showPrevious ? 'text-brand-600' : 'text-surface-400'}`}
                  title="Toggle previous cuts"
                >
                  <History size={14} />
                </button>
              )}
              <button onClick={() => setScale(s => Math.max(60, s - 20))} className="btn-ghost p-1.5" title="Zoom out"><ZoomOut size={14} /></button>
              <span className="text-xs font-mono text-surface-500 w-12 text-center">{scale}px/m</span>
              <button onClick={() => setScale(s => Math.min(300, s + 20))} className="btn-ghost p-1.5" title="Zoom in"><ZoomIn size={14} /></button>
              <button onClick={() => setShowLabels(!showLabels)} className="btn-ghost p-1.5" title="Toggle labels">{showLabels ? <Eye size={14} /> : <EyeOff size={14} />}</button>
              <button onClick={download} className="btn-ghost p-1.5 text-brand-600 hover:text-brand-700" title="Download PNG"><Download size={14} /></button>
              <button onClick={downloadA3} className="btn-ghost p-1.5 text-emerald-600 hover:text-emerald-700" title="Download A3 PNG (print-ready)"><FileDown size={14} /></button>
              <button onClick={() => setFullscreen(!fullscreen)} className="btn-ghost p-1.5 ml-1" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
          </div>
          <div className="panel-body">
            <div className={`overflow-auto bg-surface-50 rounded-lg border border-surface-200 ${fullscreen ? 'max-h-[80vh]' : 'max-h-[65vh]'}`}>
              <canvas ref={canvasRef} className="block" />
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-blue-600/80" /> Roller Blind</div>
              <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-purple-500/80" /> Zebra Blind</div>
              <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-teal-400/20 border border-teal-400 border-dashed" /> Reusable Leftover</div>
              <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-red-400/20 border border-red-300 border-dashed" /> Trim (lost)</div>
              {hasPrevious && (
                <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-slate-400/20 border border-slate-400 border-dashed" /> Previous Cut</div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium ml-auto">
                <FileDown size={11} /> A3 = 150 DPI PNG
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
