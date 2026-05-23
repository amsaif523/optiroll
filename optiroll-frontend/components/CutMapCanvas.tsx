'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Sheet } from '@/types'
import { ZoomIn, ZoomOut, Download, Eye, EyeOff, Maximize2, Minimize2, History, FileText, RotateCcw } from 'lucide-react'

interface Props {
  sheet: Sheet
  maxRollLength?: number
}

const fmtRollWidth = (v: number) => `${v.toFixed(3).replace(/\.?0+$/, '')}m`

// Show inch value without trailing zeros (e.g. 47.5 not 47.50000, 47.1234 not 47.12340)
const fmtIn = (meters: number): string => parseFloat((meters / 0.0254).toFixed(5)).toString()

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return []
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  const pushBrokenWord = (word: string) => {
    let buf = ''
    for (const ch of word) {
      const cand = buf + ch
      if (ctx.measureText(cand).width <= maxWidth) { buf = cand }
      else { if (buf) lines.push(buf); buf = ch }
    }
    if (buf) current = buf
  }
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      if (current) { lines.push(current); current = '' }
      if (ctx.measureText(word).width <= maxWidth) { current = word }
      else { pushBrokenWord(word) }
    }
  }
  if (current) lines.push(current)
  return lines
}

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

function isReusableRect(
  w: { x: number; y: number; width: number; height: number },
  reusables: Sheet['reusable_leftovers']
) {
  const TOL = 0.005
  return reusables.some(r =>
    Math.abs(r.x - w.x) < TOL && Math.abs(r.y - w.y) < TOL &&
    Math.abs(r.width - w.width) < TOL && Math.abs(r.height - w.height) < TOL
  )
}

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

  ctx.fillStyle = '#f8f9fc'
  ctx.fillRect(0, 0, cw, ch)

  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(0, 0, cw, TOPBAR)
  ctx.fillStyle = '#e2e6f0'
  ctx.font = 'bold 13px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  const cutArea = sheet.width * sheet.length
  const reusableArea = (sheet.reusable_leftovers || []).reduce((s, r) => s + r.width * r.height, 0)
  const totalWasteArea = (sheet.waste_areas || []).reduce((s, w) => s + w.width * w.height, 0)
  const trimArea = Math.max(0, totalWasteArea - reusableArea)
  const reusablePct = cutArea > 0 ? (reusableArea / cutArea) * 100 : 0
  const trimPct = cutArea > 0 ? (trimArea / cutArea) * 100 : 0

  const tailLength = (!isLeftover && maxRollLength && maxRollLength > sheet.length)
    ? maxRollLength - sheet.length : 0
  const tailArea = tailLength * sheet.width

  if (isLeftover && hasPrevious) {
    ctx.fillText(
      `Sheet #${sheet.sheet_number}  ·  Reused Leftover  ·  Original: ${fmtRollWidth(canvasWidth)} × ${canvasLength.toFixed(2)}m`,
      MARGIN, 20
    )
    ctx.fillStyle = '#9aa3b8'; ctx.font = '12px Inter, sans-serif'
    ctx.fillText(`Util ${sheet.utilization}%  ·  Reusable ${reusablePct.toFixed(1)}%  ·  Trim ${trimPct.toFixed(1)}%  ·  ${sheet.blinds.length} pieces`, MARGIN, 44)
  } else {
    ctx.fillText(`Sheet #${sheet.sheet_number}  ·  Fresh Roll  ·  ${fmtRollWidth(sheet.width)} × ${sheet.length.toFixed(2)}m`, MARGIN, 20)
    ctx.fillStyle = '#9aa3b8'; ctx.font = '12px Inter, sans-serif'
    const tailLabel = tailLength > 0
      ? `  ·  +${tailLength.toFixed(2)}m tail saved as leftover (${tailArea.toFixed(2)}m²)` : ''
    ctx.fillText(`Util ${sheet.utilization}%  ·  Reusable ${reusablePct.toFixed(1)}%  ·  Trim ${trimPct.toFixed(1)}%  ·  ${sheet.blinds.length} pieces${tailLabel}`, MARGIN, 44)
  }

  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#c8cdd9'; ctx.lineWidth = 1.5
  ctx.fillRect(MARGIN, MARGIN + TOPBAR, sw, sh)
  ctx.strokeRect(MARGIN, MARGIN + TOPBAR, sw, sh)

  ctx.strokeStyle = '#e8ebf2'; ctx.lineWidth = 0.5
  for (let i = 0; i <= Math.floor(canvasWidth); i++) {
    const x = MARGIN + i * scale
    ctx.beginPath(); ctx.moveTo(x, MARGIN + TOPBAR); ctx.lineTo(x, MARGIN + TOPBAR + sh); ctx.stroke()
  }
  for (let i = 0; i <= Math.ceil(canvasLength); i++) {
    const y = MARGIN + TOPBAR + i * scale
    ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(MARGIN + sw, y); ctx.stroke()
  }

  if (isLeftover && hasPrevious) {
    const zx = MARGIN + offX * scale, zy = MARGIN + TOPBAR + offY * scale
    const zw = sheet.width * scale, zh = sheet.length * scale
    ctx.fillStyle = 'rgba(16, 185, 129, 0.06)'; ctx.fillRect(zx, zy, zw, zh)
    ctx.strokeStyle = '#10b981'; ctx.setLineDash([8, 4]); ctx.lineWidth = 2.5
    ctx.strokeRect(zx, zy, zw, zh); ctx.setLineDash([])
    ctx.fillStyle = '#10b981'; ctx.font = 'bold 11px Inter, sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('▶ REUSABLE ZONE ◀', zx + 8, zy + 8)
  }

  if (showPrevious && hasPrevious) {
    for (const b of sheet.previous_blinds) {
      const bx = MARGIN + b.x * scale, by = MARGIN + TOPBAR + b.y * scale
      const bw = b.width * scale, bh = b.height * scale
      if (bx + bw < MARGIN || bx > MARGIN + sw || by + bh < MARGIN + TOPBAR || by > MARGIN + TOPBAR + sh) continue
      ctx.fillStyle = 'rgba(148, 163, 184, 0.12)'; ctx.fillRect(bx, by, bw, bh)
      ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'; ctx.lineWidth = 1
      for (let i = -bh; i < bw + bh; i += 10) {
        ctx.beginPath(); ctx.moveTo(bx + i, by); ctx.lineTo(bx + i - bh, by + bh); ctx.stroke()
      }
      ctx.restore()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1
      ctx.strokeRect(bx, by, bw, bh); ctx.setLineDash([])
      if (showLabels && bw > 40 && bh > 24) {
        ctx.fillStyle = '#64748b'; ctx.font = 'bold 9px Inter, sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('PREVIOUS', bx + bw / 2, by + bh / 2 - 6)
        ctx.font = '8px Inter, sans-serif'
        ctx.fillText(`${fmtIn(b.width)}"×${fmtIn(b.height)}"`, bx + bw / 2, by + bh / 2 + 6)
      }
    }
  }

  const reusableRects = sheet.reusable_leftovers || []
  for (const w of sheet.waste_areas) {
    const wx = MARGIN + (w.x + offX) * scale, wy = MARGIN + TOPBAR + (w.y + offY) * scale
    const ww = w.width * scale, wh = w.height * scale
    const reusable = isReusableRect(w, reusableRects)
    if (reusable) {
      ctx.fillStyle = 'rgba(20, 184, 166, 0.12)'; ctx.fillRect(wx, wy, ww, wh)
      ctx.strokeStyle = '#5eead4'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2
      ctx.strokeRect(wx, wy, ww, wh); ctx.setLineDash([])
      if (showLabels && ww > 50 && wh > 24) {
        ctx.fillStyle = '#0d9488'; ctx.font = 'bold 10px Inter, sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('REUSABLE', wx + ww / 2, wy + wh / 2 - 5)
        ctx.font = '9px Inter, sans-serif'; ctx.fillStyle = '#14b8a6'
        ctx.fillText('→ leftover', wx + ww / 2, wy + wh / 2 + 7)
      }
    } else {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)'; ctx.fillRect(wx, wy, ww, wh)
      ctx.strokeStyle = '#fca5a5'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2
      ctx.strokeRect(wx, wy, ww, wh); ctx.setLineDash([])
      if (showLabels && ww > 35 && wh > 20) {
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 10px Inter, sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('TRIM', wx + ww / 2, wy + wh / 2)
      }
    }
  }

  for (const b of sheet.blinds) {
    const bx = MARGIN + (b.x + offX) * scale, by = MARGIN + TOPBAR + (b.y + offY) * scale
    const bw = b.width * scale, bh = b.height * scale
    const isZebra = b.blind_type === 'zebra'

    ctx.fillStyle = isZebra ? 'rgba(139, 92, 246, 0.9)' : 'rgba(37, 99, 235, 0.9)'
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5
    ctx.strokeRect(bx, by, bw, bh)

    if (showLabels) {
      const typeLabel = isZebra ? 'ZEBRA' : 'ROLLER'
      const valenceStr = b.valence !== undefined ? `Val: ${fmtIn(b.valence)}"` : null
      const cutLen     = `${fmtIn(b.height)}"`
      const wLabel     = `${fmtIn(b.width)}"`

      const fs = Math.min(12, Math.max(7, bw / 10))
      const PAD = 6
      const textMaxWidth = Math.max(10, bw - PAD * 2)

      ctx.save()
      ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip()
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

      if (bh > 80 && bw > 60) {
        const shadeFs = Math.min(fs + 1, 13)
        ctx.font = `bold ${shadeFs}px Inter, sans-serif`
        const shadeLines = b.shade_number ? wrapText(ctx, b.shade_number, textMaxWidth) : []
        const lineCount = shadeLines.length + 1 + 1 + (valenceStr ? 1 : 0) + (b.rotated ? 1 : 0)
        let lineY = by + bh / 2 - ((lineCount - 1) / 2) * (fs + 3)

        if (shadeLines.length > 0) {
          ctx.font = `bold ${shadeFs}px Inter, sans-serif`; ctx.fillStyle = '#ffffff'
          for (const line of shadeLines) {
            ctx.fillText(line, bx + bw / 2, lineY); lineY += shadeFs + 2
          }
          lineY += 2
        }

        ctx.font = `bold ${fs}px Inter, sans-serif`; ctx.fillStyle = '#ffffff'
        ctx.fillText(`${wLabel} × ${cutLen}`, bx + bw / 2, lineY); lineY += fs + 3

        ctx.font = `${fs - 1}px Inter, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(typeLabel, bx + bw / 2, lineY); lineY += fs + 2

        if (valenceStr) {
          ctx.font = `${fs - 1}px Inter, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.75)'
          ctx.fillText(valenceStr, bx + bw / 2, lineY); lineY += fs + 2
        }

        if (b.rotated) {
          ctx.font = `${fs - 2}px Inter, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.fillText('↻ 90°', bx + bw / 2, lineY)
        }
      } else if (bh > 36 && bw > 40) {
        ctx.font = `bold ${fs}px Inter, sans-serif`; ctx.fillStyle = '#ffffff'
        const dimLine = `${wLabel} × ${cutLen}`
        const shadeText = b.shade_number ? ellipsize(ctx, b.shade_number, textMaxWidth) : ellipsize(ctx, dimLine, textMaxWidth)
        ctx.fillText(shadeText, bx + bw / 2, by + bh / 2 - fs / 2 - 2)
        ctx.font = `${fs - 1}px Inter, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillText(ellipsize(ctx, b.shade_number ? dimLine : typeLabel, textMaxWidth), bx + bw / 2, by + bh / 2 + fs / 2 + 2)
      } else if (bh > 18 || bw > 30) {
        ctx.font = `bold ${Math.max(fs - 1, 7)}px Inter, sans-serif`; ctx.fillStyle = '#ffffff'
        ctx.fillText(ellipsize(ctx, b.shade_number || typeLabel, textMaxWidth), bx + bw / 2, by + bh / 2)
      }

      ctx.restore()
    }
  }

  ctx.fillStyle = '#8b93a7'; ctx.font = '11px Inter, sans-serif'
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
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)   // fullscreen root
  const scrollRef    = useRef<HTMLDivElement>(null)   // pan/scroll area

  const [scale, setScale]         = useState(140)
  const [showLabels, setShowLabels]   = useState(true)
  const [showPrevious, setShowPrevious] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDragging, setIsDragging]   = useState(false)

  const dragRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 })

  const isLeftover  = sheet.sheet_type === 'leftover'
  const hasPrevious = isLeftover && sheet.previous_blinds && sheet.previous_blinds.length > 0
  const canvasWidth  = (isLeftover && sheet.original_width  > 0) ? sheet.original_width  : sheet.width
  const canvasLength = (isLeftover && sheet.original_length > 0) ? sheet.original_length : sheet.length

  // Re-render canvas whenever sheet or view options change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderCutMap(ctx, sheet, scale, showLabels, showPrevious, MARGIN, TOPBAR, maxRollLength)
  }, [sheet, scale, showLabels, showPrevious, canvasWidth, canvasLength, maxRollLength])

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Wheel zoom — non-passive so we can preventDefault to stop scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const step = e.deltaY > 0 ? -15 : 15
      setScale(s => Math.min(500, Math.max(30, s + step)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Drag-to-pan handlers
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
    setIsDragging(true)
    e.preventDefault()
  }

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = dragRef.current.scrollLeft - (e.clientX - dragRef.current.startX)
    el.scrollTop  = dragRef.current.scrollTop  - (e.clientY - dragRef.current.startY)
  }

  const onMouseUp = () => {
    dragRef.current.active = false
    setIsDragging(false)
  }

  const resetView = () => {
    const el = scrollRef.current
    if (el) { el.scrollLeft = 0; el.scrollTop = 0 }
    setScale(140)
  }

  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await containerRef.current.requestFullscreen()
    }
  }

  // Standard PNG
  const download = useCallback(() => {
    const offscreen = document.createElement('canvas')
    const ctx = offscreen.getContext('2d')
    if (!ctx) return
    renderCutMap(ctx, sheet, 200, true, showPrevious, MARGIN, TOPBAR, maxRollLength)
    const a = document.createElement('a')
    a.download = `sheet-${sheet.sheet_number}.png`
    a.href = offscreen.toDataURL('image/png')
    a.click()
  }, [sheet, showPrevious, maxRollLength])

  // A4 PDF — professional single-page, no scroll
  const downloadPDF = useCallback(async () => {
    const { jsPDF } = await import('jspdf')

    // A4 portrait: 210 × 297 mm
    const PAGE_W = 210, PAGE_H = 297
    const PAD = 9       // mm — page padding
    const BRAND_H = 10  // mm — top branding strip
    const FOOT_H = 14   // mm — bottom legend strip

    const IMG_AREA_W = PAGE_W - PAD * 2                           // 192 mm
    const IMG_AREA_H = PAGE_H - PAD * 2 - BRAND_H - FOOT_H       // 255 mm

    // Render canvas at 150 DPI equivalent
    const MM_TO_PX = 150 / 25.4                                   // ≈ 5.906 px/mm
    const targetW_px = Math.round(IMG_AREA_W * MM_TO_PX)          // ≈ 1134 px
    const targetH_px = Math.round(IMG_AREA_H * MM_TO_PX)          // ≈ 1506 px

    const MAP_MARGIN = 40, MAP_TOPBAR = 64
    const pdfScale = Math.min(
      (targetW_px - MAP_MARGIN * 2) / canvasWidth,
      (targetH_px - MAP_MARGIN * 2 - MAP_TOPBAR) / canvasLength
    )

    const off = document.createElement('canvas')
    const ctx = off.getContext('2d')
    if (!ctx) return
    renderCutMap(ctx, sheet, pdfScale, true, showPrevious, MAP_MARGIN, MAP_TOPBAR, maxRollLength)
    const dataUrl = off.toDataURL('image/png')

    // Actual canvas size → mm at 150 DPI
    const imgW_mm = off.width  / MM_TO_PX
    const imgH_mm = off.height / MM_TO_PX

    // Centre the image horizontally inside the image area
    const imgX = PAD + (IMG_AREA_W - imgW_mm) / 2
    const imgY = PAD + BRAND_H

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // ── Page background ─────────────────────────────────────────────
    doc.setFillColor(248, 249, 252)
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

    // ── Top branding bar ────────────────────────────────────────────
    doc.setFillColor(26, 31, 46)
    doc.rect(PAD, PAD, IMG_AREA_W, BRAND_H, 'F')

    doc.setTextColor(226, 230, 240)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('OPTIROLL', PAD + 4, PAD + 6.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(155, 163, 184)
    const isLeftoverSheet = sheet.sheet_type === 'leftover'
    const sheetLabel = `Sheet #${sheet.sheet_number}  ·  ${isLeftoverSheet ? 'Reused Leftover' : 'Fresh Roll'}  ·  ${fmtRollWidth(sheet.width)} × ${sheet.length.toFixed(2)}m  ·  Util ${sheet.utilization}%`
    doc.text(sheetLabel, PAD + 24, PAD + 6.5)

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    doc.text(dateStr, PAGE_W - PAD - 4, PAD + 6.5, { align: 'right' })

    // ── Cut map image ────────────────────────────────────────────────
    doc.addImage(dataUrl, 'PNG', imgX, imgY, imgW_mm, imgH_mm)

    // ── Footer separator ─────────────────────────────────────────────
    const footerY = PAGE_H - PAD - FOOT_H
    doc.setDrawColor(200, 205, 217)
    doc.setLineWidth(0.25)
    doc.line(PAD, footerY, PAGE_W - PAD, footerY)

    // ── Legend chips ─────────────────────────────────────────────────
    const ly = footerY + 5
    let lx = PAD + 2
    const chip = (r: number, g: number, b: number, label: string) => {
      doc.setFillColor(r, g, b)
      doc.roundedRect(lx, ly - 2.5, 4.5, 4.5, 0.8, 0.8, 'F')
      doc.setFontSize(7.5)
      doc.setTextColor(71, 85, 105)
      doc.setFont('helvetica', 'normal')
      doc.text(label, lx + 6, ly + 0.8)
      lx += 6 + doc.getTextWidth(label) + 5
    }
    chip(37, 99, 235, 'Roller Blind')
    chip(139, 92, 246, 'Zebra Blind')
    chip(20, 184, 166, 'Reusable Leftover')
    chip(239, 68, 68, 'Trim (lost)')

    // ── Stats right ───────────────────────────────────────────────────
    const reusableA = (sheet.reusable_leftovers || []).reduce((s, r) => s + r.width * r.height, 0)
    const totalWasteA = (sheet.waste_areas || []).reduce((s, w) => s + w.width * w.height, 0)
    const trimA = Math.max(0, totalWasteA - reusableA)
    const cutA = sheet.width * sheet.length
    const rPct = cutA > 0 ? ((reusableA / cutA) * 100).toFixed(1) : '0.0'
    const tPct = cutA > 0 ? ((trimA / cutA) * 100).toFixed(1) : '0.0'

    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text(
      `${sheet.blinds.length} pieces  ·  Reusable ${rPct}%  ·  Trim ${tPct}%`,
      PAGE_W - PAD - 3, ly + 0.8, { align: 'right' }
    )

    // ── Page border ───────────────────────────────────────────────────
    doc.setDrawColor(200, 205, 217)
    doc.setLineWidth(0.4)
    doc.rect(PAD, PAD, IMG_AREA_W, PAGE_H - PAD * 2)

    doc.save(`sheet-${sheet.sheet_number}.pdf`)
  }, [sheet, canvasWidth, canvasLength, showPrevious, maxRollLength])

  const zoomPct = Math.round((scale / 140) * 100)

  const toolbar = (
    <div className={`flex items-center justify-between gap-2 ${isFullscreen ? 'px-4 py-3 bg-surface-900 border-b border-surface-700 shrink-0' : 'panel-header'}`}>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold ${isFullscreen ? 'text-white' : 'text-surface-800'}`}>
          Sheet #{sheet.sheet_number}
        </span>
        <span className={`badge ${isLeftover ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
          {isLeftover ? 'LEFTOVER REUSED' : 'FRESH ROLL'}
        </span>
        {isLeftover && (
          <span className={`text-xs font-medium ${isFullscreen ? 'text-amber-400' : 'text-amber-600'}`}>
            ← Original: {fmtRollWidth(sheet.original_width || 0)} × {sheet.original_length?.toFixed(2)}m
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {hasPrevious && (
          <button onClick={() => setShowPrevious(!showPrevious)}
            className={`btn-ghost p-1.5 ${showPrevious ? 'text-brand-600' : isFullscreen ? 'text-surface-400' : 'text-surface-300'}`}
            title="Toggle previous cuts">
            <History size={14} />
          </button>
        )}
        <button onClick={() => setShowLabels(!showLabels)} className={`btn-ghost p-1.5 ${isFullscreen ? 'text-surface-300' : ''}`} title="Toggle labels">
          {showLabels ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>

        {/* Zoom controls */}
        <div className={`flex items-center gap-0.5 mx-1 px-2 py-0.5 rounded-lg ${isFullscreen ? 'bg-surface-800' : 'bg-surface-100'}`}>
          <button onClick={() => setScale(s => Math.max(30, s - 20))} className="btn-ghost p-1" title="Zoom out (or scroll down)">
            <ZoomOut size={13} />
          </button>
          <span className={`text-[11px] font-mono font-bold w-10 text-center ${isFullscreen ? 'text-surface-200' : 'text-surface-600'}`}>
            {zoomPct}%
          </span>
          <button onClick={() => setScale(s => Math.min(500, s + 20))} className="btn-ghost p-1" title="Zoom in (or scroll up)">
            <ZoomIn size={13} />
          </button>
        </div>

        <button onClick={resetView} className={`btn-ghost p-1.5 ${isFullscreen ? 'text-surface-300' : ''}`} title="Reset zoom & pan">
          <RotateCcw size={13} />
        </button>
        <button onClick={download} className="btn-ghost p-1.5 text-brand-600 hover:text-brand-700" title="Download PNG">
          <Download size={14} />
        </button>
        <button onClick={downloadPDF} className="btn-ghost p-1.5 text-emerald-600 hover:text-emerald-700" title="Download PDF (A4, single page)">
          <FileText size={14} />
        </button>
        <button onClick={toggleFullscreen} className={`btn-ghost p-1.5 ml-1 ${isFullscreen ? 'text-surface-300' : ''}`}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (drag to pan, scroll to zoom)'}>
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </div>
  )

  const hint = (
    <p className={`text-[10px] mt-1.5 ${isFullscreen ? 'text-surface-500' : 'text-surface-400'}`}>
      Drag to pan · Scroll to zoom · {zoomPct}% · {scale}px/m
    </p>
  )

  const legend = (
    <div className={`flex flex-wrap gap-4 ${isFullscreen ? 'px-4 pb-3 pt-2 border-t border-surface-700 shrink-0' : 'mt-3'}`}>
      <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-blue-600/80" /> Roller Blind</div>
      <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-purple-500/80" /> Zebra Blind</div>
      <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-teal-400/20 border border-teal-400 border-dashed" /> Reusable Leftover</div>
      <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-red-400/20 border border-red-300 border-dashed" /> Trim (lost)</div>
      {hasPrevious && <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-slate-400/20 border border-slate-400 border-dashed" /> Previous Cut</div>}
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium ml-auto">
        <FileText size={11} /> PDF = A4 single page
      </div>
    </div>
  )

  return (
    <div ref={containerRef} className={isFullscreen ? 'flex flex-col bg-surface-900 overflow-hidden' : 'panel overflow-hidden'}>
      {toolbar}

      <div className={isFullscreen ? 'flex-1 flex flex-col min-h-0 px-4 py-3' : 'panel-body'}>
        {/* Canvas scroll + pan container */}
        <div
          ref={scrollRef}
          className={`overflow-auto select-none rounded-lg border border-surface-200 bg-surface-50 ${
            isFullscreen ? 'flex-1' : 'max-h-[68vh]'
          }`}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <canvas ref={canvasRef} className="block" />
        </div>

        {/* Hint + legend */}
        {!isFullscreen && hint}
        {isFullscreen ? legend : (
          <div className="flex flex-wrap gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-blue-600/80" /> Roller Blind</div>
            <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-purple-500/80" /> Zebra Blind</div>
            <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-teal-400/20 border border-teal-400 border-dashed" /> Reusable Leftover</div>
            <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-red-400/20 border border-red-300 border-dashed" /> Trim (lost)</div>
            {hasPrevious && <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-slate-400/20 border border-slate-400 border-dashed" /> Previous Cut</div>}
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium ml-auto">
              <FileText size={11} /> PDF = A4 single page
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
