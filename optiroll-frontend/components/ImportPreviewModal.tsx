'use client'

import { useMemo, useState } from 'react'
import { WorkOrderItem } from '@/types'
import { X, AlertCircle, CheckCircle2, FileSpreadsheet, ChevronDown } from 'lucide-react'

const IN_TO_M = 0.0254
const fmtRollWidth = (v: number) => `${v.toFixed(3).replace(/\.?0+$/, '')}m`

export type FieldKey =
  | 'shade' | 'type' | 'width' | 'height' | 'valence'
  | 'qty' | 'material' | 'color' | 'pattern' | 'widths'

export interface ImportPreviewProps {
  fileName: string
  headerCells: string[]
  dataRows: unknown[][]
  initialMapping: Partial<Record<FieldKey, number>>
  availableWidths: number[]
  allowRotation: boolean
  onCancel: () => void
  onConfirm: (items: WorkOrderItem[]) => void
}

const FIELDS: { key: FieldKey; label: string; required: boolean; defaultText: string }[] = [
  { key: 'shade',    label: 'Shade # / Product Name', required: false, defaultText: 'Auto-generate (1, 2, 3…)' },
  { key: 'type',     label: 'Type',                   required: false, defaultText: 'Use default below' },
  { key: 'width',    label: 'Width (")',              required: true,  defaultText: '' },
  { key: 'height',   label: 'Height (")',             required: true,  defaultText: '' },
  { key: 'valence',  label: 'Valence (")',            required: false, defaultText: 'Default: 6"' },
  { key: 'qty',      label: 'Qty',                    required: false, defaultText: 'Default: 1' },
  { key: 'material', label: 'Material',               required: false, defaultText: 'Default: Polyester' },
  { key: 'color',    label: 'Color',                  required: false, defaultText: 'Default: White' },
  { key: 'pattern',  label: 'Pattern',               required: false, defaultText: 'Default: Plain' },
  { key: 'widths',   label: 'Roll Widths (col)',      required: false, defaultText: 'Use default below' },
]

export default function ImportPreviewModal({
  fileName, headerCells, dataRows, initialMapping,
  availableWidths, allowRotation,
  onCancel, onConfirm,
}: ImportPreviewProps) {
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>(initialMapping)
  const [defaultType, setDefaultType] = useState<'roller' | 'zebra'>('roller')
  const [defaultWidths, setDefaultWidths] = useState<number[]>(() => [...availableWidths])
  const [rowOverrides, setRowOverrides] = useState<Record<number, { type?: 'roller' | 'zebra'; widths?: number[] }>>({})

  // Width picker dropdown state
  const [openWidthRow, setOpenWidthRow] = useState<number | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  const openWidthPicker = (rowNum: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openWidthRow === rowNum) {
      setOpenWidthRow(null)
      setDropdownPos(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setOpenWidthRow(rowNum)
    setDropdownPos({ top: rect.bottom + 6, left: rect.left })
  }

  const closeWidthPicker = () => {
    setOpenWidthRow(null)
    setDropdownPos(null)
  }

  const setRowType = (rowNum: number, t: 'roller' | 'zebra') =>
    setRowOverrides(prev => ({ ...prev, [rowNum]: { ...prev[rowNum], type: t } }))

  const toggleRowWidth = (rowNum: number, w: number, currentWidths: number[]) => {
    const isSelected = currentWidths.includes(w)
    if (isSelected && currentWidths.length === 1) return
    const next = isSelected
      ? currentWidths.filter(x => x !== w)
      : [...currentWidths, w].sort((a, b) => a - b)
    setRowOverrides(prev => ({ ...prev, [rowNum]: { ...prev[rowNum], widths: next } }))
  }

  const setAllWidthsForRow = (rowNum: number) =>
    setRowOverrides(prev => ({ ...prev, [rowNum]: { ...prev[rowNum], widths: [...availableWidths] } }))

  const toggleDefaultWidth = (w: number) => {
    setDefaultWidths(prev => {
      const sel = prev.includes(w)
      if (sel && prev.length === 1) return prev
      return sel ? prev.filter(x => x !== w) : [...prev, w].sort((a, b) => a - b)
    })
  }

  const computed = useMemo(() => {
    interface PreviewRow {
      rowNum: number
      shade: string
      type: 'roller' | 'zebra'
      widthIn: number
      heightIn: number
      valenceIn: number
      qty: number
      material: string
      color: string
      pattern: string
      selectedWidths: number[]
    }

    const items: WorkOrderItem[] = []
    const previewRows: PreviewRow[] = []
    const skipped: { row: number; reason: string }[] = []
    let autoShade = 1

    const widthCol  = mapping.width
    const heightCol = mapping.height
    if (widthCol === undefined || heightCol === undefined) return { items, previewRows, skipped }

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i]
      const rowNum = i + 1

      if (r.every(c => String(c ?? '').trim() === '')) continue

      const widthRaw  = parseFloat(String(r[widthCol]  ?? ''))
      const heightRaw = parseFloat(String(r[heightCol] ?? ''))
      if (isNaN(widthRaw) || widthRaw <= 0 || isNaN(heightRaw) || heightRaw <= 0) continue

      const shadeCell = mapping.shade !== undefined ? String(r[mapping.shade] ?? '').trim() : ''
      const shade = shadeCell || String(autoShade++)

      // Type: row override > column mapping > default
      let blindType: 'roller' | 'zebra'
      if (rowOverrides[rowNum]?.type !== undefined) {
        blindType = rowOverrides[rowNum].type!
      } else if (mapping.type !== undefined) {
        blindType = String(r[mapping.type] ?? '').trim().toLowerCase() === 'zebra' ? 'zebra' : 'roller'
      } else {
        blindType = defaultType
      }

      const valenceCell = mapping.valence !== undefined ? String(r[mapping.valence] ?? '').trim() : ''
      const valenceParsed = parseFloat(valenceCell)
      const valenceIn = valenceCell === '' || isNaN(valenceParsed) ? 6 : valenceParsed

      const qtyParsed = mapping.qty !== undefined ? parseInt(String(r[mapping.qty] ?? ''), 10) : NaN
      const qty = isNaN(qtyParsed) || qtyParsed < 1 ? 1 : qtyParsed

      const material = (mapping.material !== undefined ? String(r[mapping.material] ?? '').trim() : '') || 'Polyester'
      const color    = (mapping.color    !== undefined ? String(r[mapping.color]    ?? '').trim() : '') || 'White'
      const pattern  = (mapping.pattern  !== undefined ? String(r[mapping.pattern]  ?? '').trim() : '') || 'Plain'

      // Widths: row override > column mapping > default
      let selectedWidths: number[]
      if (rowOverrides[rowNum]?.widths !== undefined) {
        selectedWidths = rowOverrides[rowNum].widths!.filter(v => availableWidths.includes(v))
      } else if (mapping.widths !== undefined) {
        const raw = String(r[mapping.widths] ?? '').trim()
        if (!raw || raw.toLowerCase() === 'all') {
          selectedWidths = [...defaultWidths]
        } else {
          const matched = raw.split(',')
            .map(s => parseFloat(s.trim()))
            .filter(v => !isNaN(v) && v > 0)
            .map(v => availableWidths.find(aw => Math.abs(aw - v) < 0.001))
            .filter((v): v is number => v !== undefined)
          selectedWidths = matched.length > 0 ? matched : [...defaultWidths]
        }
      } else {
        selectedWidths = [...defaultWidths]
      }

      if (availableWidths.length === 0 || selectedWidths.length === 0) {
        skipped.push({ row: rowNum, reason: 'No roll widths configured in Settings' })
        continue
      }

      const widthM   = widthRaw  * IN_TO_M
      const heightM  = heightRaw * IN_TO_M
      const valenceM = valenceIn * IN_TO_M
      const finalHeightM = blindType === 'zebra' ? heightM * 2 + valenceM : heightM + valenceM
      const maxW = Math.max(...selectedWidths)

      if (widthM > maxW && !(allowRotation && finalHeightM <= maxW)) {
        skipped.push({ row: rowNum, reason: `${widthRaw}" won't fit on selected widths (max ${fmtRollWidth(maxW)})` })
        continue
      }

      previewRows.push({ rowNum, shade, type: blindType, widthIn: widthRaw, heightIn: heightRaw, valenceIn, qty, material, color, pattern, selectedWidths })
      items.push({
        id: crypto.randomUUID(),
        shade_number: shade,
        blind_type: blindType,
        width: widthM, height: heightM, valence: valenceM,
        quantity: qty,
        material_type: material, color, pattern,
        selected_widths: selectedWidths,
        grain_locked: false,
      })
    }

    return { items, previewRows, skipped }
  }, [mapping, dataRows, availableWidths, allowRotation, defaultType, defaultWidths, rowOverrides])

  const updateMapping = (key: FieldKey, value: string) => {
    setMapping(m => {
      const next = { ...m }
      if (value === '__default__') delete next[key]
      else next[key] = parseInt(value, 10)
      return next
    })
  }

  const widthMissing  = mapping.width  === undefined
  const heightMissing = mapping.height === undefined
  const canImport = !widthMissing && !heightMissing && computed.items.length > 0

  const openRow = openWidthRow !== null
    ? computed.previewRows.find(r => r.rowNum === openWidthRow) ?? null
    : null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />

      {/* Full-body modal */}
      <div className="fixed inset-2 z-50 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="shrink-0 px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={16} className="text-brand-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Import from Excel</h2>
              <p className="text-[11px] text-surface-400 mt-0.5 truncate">
                <span className="font-medium text-surface-500">{fileName}</span>
                <span className="ml-2">— map columns on the left, review &amp; edit pieces on the right, then confirm.</span>
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-surface-400 hover:text-surface-700 transition-colors shrink-0 ml-4">
            <X size={18} />
          </button>
        </div>

        {/* ── Two-pane body ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Left pane — column mapping + defaults */}
          <div className="w-[400px] shrink-0 border-r border-surface-200 overflow-y-auto px-5 py-5 space-y-5">

            {/* Column mapping */}
            <div>
              <h3 className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-3">Column Mapping</h3>
              <div className="space-y-2">
                {FIELDS.map(f => {
                  const isMissing = f.required && mapping[f.key] === undefined
                  return (
                    <div key={f.key} className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold w-36 shrink-0 ${isMissing ? 'text-red-600' : 'text-surface-600'}`}>
                        {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
                      <select
                        value={mapping[f.key] !== undefined ? String(mapping[f.key]) : '__default__'}
                        onChange={e => updateMapping(f.key, e.target.value)}
                        className={`flex-1 min-w-0 text-[11px] rounded-lg border px-2 py-1.5 bg-white font-medium outline-none focus:ring-2 focus:ring-brand-300 ${
                          isMissing ? 'border-red-300 text-red-600' : 'border-surface-200 text-surface-700'
                        }`}
                      >
                        {f.required
                          ? <option value="__default__" disabled>— Select a column —</option>
                          : <option value="__default__">— {f.defaultText} —</option>}
                        {headerCells.map((cell, idx) => (
                          <option key={idx} value={idx}>{cell || `Column ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              {(widthMissing || heightMissing) && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-[11px] text-red-700 flex items-start gap-2">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span><b>Width</b> and <b>Height</b> columns are required to generate a preview.</span>
                </div>
              )}
            </div>

            {/* Skipped rows */}
            {computed.skipped.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-[11px] font-bold text-amber-700 mb-2 flex items-center gap-1.5">
                  <AlertCircle size={13} />
                  {computed.skipped.length} row{computed.skipped.length !== 1 ? 's' : ''} skipped
                </p>
                <ul className="text-[11px] text-amber-700/80 space-y-1 max-h-40 overflow-y-auto pl-4 list-disc">
                  {computed.skipped.map((s, i) => (
                    <li key={i}>Row {s.row}: {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right pane — defaults strip + live preview table */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Header */}
            <div className="shrink-0 px-6 pt-5 pb-3">
              <h3 className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                Pieces to Import
                <span className="ml-2 text-brand-600">{computed.previewRows.length}</span>
              </h3>
              <p className="text-[11px] text-surface-400 mt-0.5">
                Use the dropdowns in each row to set type and widths per piece.
              </p>
            </div>

            {/* Defaults strip — applies when a column isn't mapped; per-row overrides still work */}
            <div className="shrink-0 mx-6 mb-3 bg-surface-50 border border-surface-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Defaults</span>
                <span className="text-[10px] text-surface-400">— used when a column isn&apos;t mapped (override per-row below)</span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {/* Default blind type */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-surface-500">Blind Type</span>
                  <div className="flex gap-1 p-0.5 bg-white border border-surface-200 rounded-lg">
                    {(['roller', 'zebra'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setDefaultType(t)}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                          defaultType === t
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'text-surface-500 hover:bg-surface-100'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default roll widths */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-surface-500">Roll Widths</span>
                  <button
                    onClick={() => setDefaultWidths([...availableWidths])}
                    className={`py-1 px-2.5 rounded-md text-[10px] font-bold border transition-all ${
                      defaultWidths.length === availableWidths.length
                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                        : 'bg-white text-surface-500 border-surface-200 hover:bg-surface-100'
                    }`}
                  >
                    All
                  </button>
                  {availableWidths.map(w => (
                    <button
                      key={w}
                      onClick={() => toggleDefaultWidth(w)}
                      className={`py-1 px-2.5 rounded-md text-[10px] font-bold border transition-all ${
                        defaultWidths.includes(w)
                          ? 'bg-brand-50 text-brand-700 border-brand-300'
                          : 'bg-white text-surface-400 border-surface-200 hover:bg-surface-100'
                      }`}
                    >
                      {fmtRollWidth(w)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {computed.previewRows.length === 0 ? (
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="text-center py-12 px-8 bg-surface-50 rounded-2xl border border-surface-200 w-full max-w-md">
                  <FileSpreadsheet size={32} className="text-surface-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-surface-500">No pieces yet</p>
                  <p className="text-xs text-surface-400 mt-1">
                    Map <b>Width</b> and <b>Height</b> columns on the left to see pieces here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden px-6 pb-3">
                <div className="h-full border border-surface-200 rounded-xl overflow-hidden flex flex-col">
                  {/* Single table with sticky thead — column widths share automatically and cells can wrap freely */}
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full table-fixed text-[11px]">
                      <thead className="sticky top-0 z-10 bg-surface-100 border-b border-surface-200">
                        <tr className="text-surface-500 uppercase tracking-wider font-bold">
                          <th className="px-3 py-2.5 text-left w-[20%]">Shade / Product</th>
                          <th className="px-3 py-2.5 text-left w-[8%]">Type</th>
                          <th className="px-3 py-2.5 text-right w-[6%]">W (&quot;)</th>
                          <th className="px-3 py-2.5 text-right w-[6%]">H (&quot;)</th>
                          <th className="px-3 py-2.5 text-right w-[5%]">Val (&quot;)</th>
                          <th className="px-3 py-2.5 text-right w-[5%]">Qty</th>
                          <th className="px-3 py-2.5 text-left w-[10%]">Material</th>
                          <th className="px-3 py-2.5 text-left w-[9%]">Color</th>
                          <th className="px-3 py-2.5 text-left w-[9%]">Pattern</th>
                          <th className="px-3 py-2.5 text-left w-[22%]">Roll Widths</th>
                        </tr>
                      </thead>
                      <tbody>
                        {computed.previewRows.map((p, i) => (
                          <tr key={i} className={`border-b border-surface-100 hover:bg-brand-50/30 transition-colors align-top ${i % 2 === 0 ? '' : 'bg-surface-50/40'}`}>
                            <td className="px-3 py-2 font-mono font-bold text-surface-800 break-words whitespace-normal" title={p.shade}>
                              {p.shade}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={p.type}
                                onChange={e => setRowType(p.rowNum, e.target.value as 'roller' | 'zebra')}
                                className={`w-full text-[10px] font-bold px-2 py-1 rounded-lg border cursor-pointer outline-none focus:ring-2 focus:ring-brand-300 transition-colors ${
                                  p.type === 'zebra'
                                    ? 'bg-purple-50 border-purple-200 text-purple-700'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                }`}
                              >
                                <option value="roller">Roller</option>
                                <option value="zebra">Zebra</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-surface-700">{p.widthIn}</td>
                            <td className="px-3 py-2 text-right font-mono text-surface-700">{p.heightIn}</td>
                            <td className="px-3 py-2 text-right font-mono text-surface-500">{p.valenceIn}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-surface-800">{p.qty}</td>
                            <td className="px-3 py-2 text-surface-600 break-words whitespace-normal">{p.material}</td>
                            <td className="px-3 py-2 text-surface-600 break-words whitespace-normal">{p.color}</td>
                            <td className="px-3 py-2 text-surface-600 break-words whitespace-normal">{p.pattern}</td>
                            <td className="px-3 py-2">
                              <button
                                onClick={e => openWidthPicker(p.rowNum, e)}
                                className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border w-full transition-colors ${
                                  openWidthRow === p.rowNum
                                    ? 'bg-brand-600 text-white border-brand-600'
                                    : 'bg-white border-surface-200 text-surface-700 hover:border-brand-300 hover:bg-brand-50'
                                }`}
                              >
                                <span className="flex-1 text-left break-words whitespace-normal">
                                  {p.selectedWidths.length === availableWidths.length
                                    ? 'All widths'
                                    : p.selectedWidths.map(fmtRollWidth).join(', ')}
                                </span>
                                <ChevronDown size={10} className="shrink-0" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-6 py-4 border-t border-surface-200 flex items-center justify-between gap-3">
          <div className="text-[11px]">
            {canImport ? (
              <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                Ready to import {computed.items.length} piece{computed.items.length !== 1 ? 's' : ''}
                {computed.skipped.length > 0 && (
                  <span className="ml-2 text-amber-600 font-semibold">
                    · {computed.skipped.length} row{computed.skipped.length !== 1 ? 's' : ''} skipped
                  </span>
                )}
              </span>
            ) : (
              <span className="text-surface-400">Map the Width and Height columns on the left to begin.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold text-surface-600 hover:text-surface-800 hover:bg-surface-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(computed.items)}
              disabled={!canImport}
              className="px-5 py-2 bg-brand-600 text-white text-xs font-bold rounded-xl hover:bg-brand-700 disabled:bg-surface-200 disabled:text-surface-400 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Confirm &amp; Import
            </button>
          </div>
        </div>
      </div>

      {/* Width picker dropdown — fixed-positioned so it escapes any overflow:hidden parent */}
      {openRow !== null && dropdownPos !== null && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={closeWidthPicker} />
          <div
            className="fixed z-[70] bg-white border border-surface-200 rounded-xl shadow-2xl p-3 min-w-[170px]"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-surface-100">
              <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wide">Roll Widths</span>
              <button
                onClick={() => setAllWidthsForRow(openRow.rowNum)}
                className="text-[10px] font-bold text-brand-600 hover:text-brand-700 transition-colors"
              >
                Select All
              </button>
            </div>
            <div className="space-y-2">
              {availableWidths.map(w => {
                const sel = openRow.selectedWidths.includes(w)
                return (
                  <label key={w} className="flex items-center gap-2.5 cursor-pointer group select-none">
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleRowWidth(openRow.rowNum, w, openRow.selectedWidths)}
                      className="w-4 h-4 accent-brand-600 cursor-pointer rounded"
                    />
                    <span className={`text-xs font-bold transition-colors ${
                      sel ? 'text-brand-700' : 'text-surface-500 group-hover:text-surface-700'
                    }`}>
                      {fmtRollWidth(w)}
                    </span>
                  </label>
                )
              })}
            </div>
            {openRow.selectedWidths.length < availableWidths.length && (
              <p className="text-[10px] text-surface-400 mt-2.5 pt-2 border-t border-surface-100">
                {openRow.selectedWidths.length} of {availableWidths.length} selected
              </p>
            )}
          </div>
        </>
      )}
    </>
  )
}
