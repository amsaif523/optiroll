'use client'

import { useRef, useEffect, useState } from 'react'
import { Sheet } from '@/types'
import { ZoomIn, ZoomOut, Download, Eye, EyeOff, Maximize2, Minimize2, History } from 'lucide-react'

interface Props {
  sheet: Sheet
}

export default function CutMapCanvas({ sheet }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(140)
  const [showLabels, setShowLabels] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [showPrevious, setShowPrevious] = useState(true)

  const MARGIN = 60
  const TOPBAR = 64

  const isLeftover = sheet.sheet_type === 'leftover'
  const hasPrevious = isLeftover && sheet.previous_blinds && sheet.previous_blinds.length > 0

  // For leftovers: use original sheet dimensions so user sees full history
  // For fresh rolls: just use current sheet dimensions
  const canvasWidth = (isLeftover && sheet.original_width > 0) ? sheet.original_width : sheet.width
  const canvasLength = (isLeftover && sheet.original_length > 0) ? sheet.original_length : sheet.length

  const offX = isLeftover ? sheet.leftover_offset_x : 0
  const offY = isLeftover ? sheet.leftover_offset_y : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sw = canvasWidth * scale
    const sh = canvasLength * scale
    canvas.width = sw + MARGIN * 2
    canvas.height = sh + MARGIN * 2 + TOPBAR

    // Background
    ctx.fillStyle = '#f8f9fc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Top bar
    ctx.fillStyle = '#1a1f2e'
    ctx.fillRect(0, 0, canvas.width, TOPBAR)
    ctx.fillStyle = '#e2e6f0'
    ctx.font = 'bold 13px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    if (isLeftover && hasPrevious) {
      ctx.fillText(
        `Sheet #${sheet.sheet_number}  ·  Reused Leftover  ·  Original: ${canvasWidth.toFixed(2)}m × ${canvasLength.toFixed(2)}m`,
        MARGIN, 20
      )
      ctx.fillStyle = '#9aa3b8'
      ctx.font = '12px Inter, sans-serif'
      ctx.fillText(
        `Leftover zone: ${offX.toFixed(2)},${offY.toFixed(2)} → ${(offX + sheet.width).toFixed(2)}m × ${(offY + sheet.length).toFixed(2)}m  ·  Util ${sheet.utilization}%  ·  Waste ${sheet.waste}%`,
        MARGIN, 44
      )
    } else {
      ctx.fillText(
        `Sheet #${sheet.sheet_number}  ·  Fresh Roll  ·  ${sheet.width}m × ${sheet.length.toFixed(2)}m`,
        MARGIN, 20
      )
      ctx.fillStyle = '#9aa3b8'
      ctx.font = '12px Inter, sans-serif'
      ctx.fillText(
        `Utilization ${sheet.utilization}%  ·  Waste ${sheet.waste}%  ·  ${sheet.blinds.length} pieces`,
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
      ctx.beginPath()
      ctx.moveTo(x, MARGIN + TOPBAR)
      ctx.lineTo(x, MARGIN + TOPBAR + sh)
      ctx.stroke()
    }
    for (let i = 0; i <= Math.ceil(canvasLength); i++) {
      const y = MARGIN + TOPBAR + i * scale
      ctx.beginPath()
      ctx.moveTo(MARGIN, y)
      ctx.lineTo(MARGIN + sw, y)
      ctx.stroke()
    }

    // ─── LEFTOVER ZONE HIGHLIGHT (for reused sheets) ───
    if (isLeftover && hasPrevious) {
      const zx = MARGIN + offX * scale
      const zy = MARGIN + TOPBAR + offY * scale
      const zw = sheet.width * scale
      const zh = sheet.length * scale

      // Subtle highlight background for the reusable zone
      ctx.fillStyle = 'rgba(16, 185, 129, 0.06)'
      ctx.fillRect(zx, zy, zw, zh)

      // Green border around the leftover zone
      ctx.strokeStyle = '#10b981'
      ctx.setLineDash([8, 4])
      ctx.lineWidth = 2.5
      ctx.strokeRect(zx, zy, zw, zh)
      ctx.setLineDash([])

      // Label on the zone border
      ctx.fillStyle = '#10b981'
      ctx.font = 'bold 11px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('▶ REUSABLE ZONE ◀', zx + 8, zy + 8)
    }

    // ─── PREVIOUS CUTS (ghosted) ───
    if (showPrevious && hasPrevious) {
      for (const b of sheet.previous_blinds) {
        const bx = MARGIN + b.x * scale
        const by = MARGIN + TOPBAR + b.y * scale
        const bw = b.width * scale
        const bh = b.height * scale

        // Only draw if visible on canvas
        if (bx + bw < MARGIN || bx > MARGIN + sw || by + bh < MARGIN + TOPBAR || by > MARGIN + TOPBAR + sh) {
          continue
        }

        // Ghosted background
        ctx.fillStyle = 'rgba(148, 163, 184, 0.12)'
        ctx.fillRect(bx, by, bw, bh)

        // Diagonal hatching
        ctx.save()
        ctx.beginPath()
        ctx.rect(bx, by, bw, bh)
        ctx.clip()
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'
        ctx.lineWidth = 1
        for (let i = -bh; i < bw + bh; i += 10) {
          ctx.beginPath()
          ctx.moveTo(bx + i, by)
          ctx.lineTo(bx + i - bh, by + bh)
          ctx.stroke()
        }
        ctx.restore()

        // Dashed border
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.strokeRect(bx, by, bw, bh)
        ctx.setLineDash([])

        // Label
        if (showLabels && bw > 40 && bh > 24) {
          ctx.fillStyle = '#64748b'
          ctx.font = 'bold 9px Inter, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('PREVIOUS', bx + bw / 2, by + bh / 2 - 6)
          ctx.font = '8px Inter, sans-serif'
          ctx.fillText(`${b.width.toFixed(2)}×${b.height.toFixed(2)}m`, bx + bw / 2, by + bh / 2 + 6)
        }
      }
    }

    // ─── WASTE AREAS ───
    for (const w of sheet.waste_areas) {
      const wx = MARGIN + (w.x + offX) * scale
      const wy = MARGIN + TOPBAR + (w.y + offY) * scale
      const ww = w.width * scale
      const wh = w.height * scale
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
        ctx.fillText('WASTE', wx + ww / 2, wy + wh / 2)
      }
    }

    // ─── REUSABLE LEFTOVERS ───
    for (const rl of sheet.reusable_leftovers) {
      const rx = MARGIN + (rl.x + offX) * scale
      const ry = MARGIN + TOPBAR + (rl.y + offY) * scale
      const rw = rl.width * scale
      const rh = rl.height * scale
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)'
      ctx.fillRect(rx, ry, rw, rh)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.strokeRect(rx, ry, rw, rh)
      if (showLabels && rw > 45 && rh > 28) {
        ctx.fillStyle = '#d97706'
        ctx.font = 'bold 10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('REUSABLE', rx + rw / 2, ry + rh / 2 - 8)
        ctx.font = '9px Inter, sans-serif'
        ctx.fillText(`${rl.width.toFixed(2)}×${rl.height.toFixed(2)}m`, rx + rw / 2, ry + rh / 2 + 6)
      }
    }

    // ─── CURRENT BLINDS (offset by leftover position) ───
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
        const label = `${b.width.toFixed(2)}×${b.height.toFixed(2)}`
        const typeLabel = isZebra ? 'ZEBRA' : 'ROLLER'
        const fs = Math.min(13, Math.max(8, bw / 8))
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `bold ${fs}px Inter, sans-serif`
        if (bh > 28) {
          ctx.fillText(label, bx + bw / 2, by + bh / 2 - fs / 2 - 2)
          ctx.font = `${fs - 1}px Inter, sans-serif`
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.fillText(typeLabel, bx + bw / 2, by + bh / 2 + fs / 2 + 2)
          if (b.rotated) {
            ctx.font = `${fs - 2}px Inter, sans-serif`
            ctx.fillStyle = 'rgba(255,255,255,0.6)'
            ctx.fillText('↻ 90°', bx + bw / 2, by + bh / 2 + fs + 6)
          }
        } else {
          ctx.fillText(label, bx + bw / 2, by + bh / 2)
        }
      }
    }

    // Axis labels
    ctx.fillStyle = '#8b93a7'
    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('0', MARGIN, TOPBAR + MARGIN - 8)
    ctx.fillText(`${canvasWidth.toFixed(1)}m`, MARGIN + sw, TOPBAR + MARGIN - 8)
    ctx.textAlign = 'right'
    ctx.fillText('0', MARGIN - 8, TOPBAR + MARGIN + 12)
    ctx.fillText(`${canvasLength.toFixed(2)}m`, MARGIN - 8, TOPBAR + MARGIN + sh - 6)
  }, [sheet, scale, showLabels, showPrevious, canvasWidth, canvasLength, offX, offY, hasPrevious, isLeftover])

  const download = () => {
    const c = canvasRef.current
    if (!c) return
    const a = document.createElement('a')
    a.download = `sheet-${sheet.sheet_number}.png`
    a.href = c.toDataURL('image/png')
    a.click()
  }

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
                  ← Original: {sheet.original_width?.toFixed(2)}m × {sheet.original_length?.toFixed(2)}m
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
              <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-red-400/20 border border-red-300 border-dashed" /> Dead Waste</div>
              <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-amber-400/20 border-2 border-amber-500" /> Reusable Leftover</div>
              {hasPrevious && (
                <>
                  <div className="flex items-center gap-1.5 text-xs text-surface-500"><div className="w-3 h-3 rounded-sm bg-slate-400/20 border border-slate-400 border-dashed" /> Previous Cut</div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold"><div className="w-3 h-3 rounded-sm bg-emerald-500/20 border-2 border-emerald-500" /> Reusable Zone</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}