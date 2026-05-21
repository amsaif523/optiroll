'use client'

import { useMemo, useState } from 'react'
import { WorkOrderItem } from '@/types'
import { X, AlertCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react'

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
  { key: 'shade',    label: 'Shade #',     required: false, defaultText: 'Auto-generate (1, 2, 3…)' },
  { key: 'type',     label: 'Type',        required: false, defaultText: 'Default: roller' },
  { key: 'width',    label: 'Width (")',   required: true,  defaultText: '' },
  { key: 'height',   label: 'Height (")',  required: true,  defaultText: '' },
  { key: 'valence',  label: 'Valence (")', required: false, defaultText: 'Default: 6"' },
  { key: 'qty',      label: 'Qty',         required: false, defaultText: 'Default: 1' },
  { key: 'material', label: 'Material',    required: false, defaultText: 'Default: Polyester' },
  { key: 'color',    label: 'Color',       required: false, defaultText: 'Default: White' },
  { key: 'pattern',  label: 'Pattern',     required: false, defaultText: 'Default: Plain' },
  { key: 'widths',   label: 'Roll Widths', required: false, defaultText: 'Default: all available' },
]

export default function ImportPreviewModal({
  fileName, headerCells, dataRows, initialMapping,
  availableWidths, allowRotation,
  onCancel, onConfirm,
}: ImportPreviewProps) {
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>(initialMapping)

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
      widthsLabel: string
    }

    const items: WorkOrderItem[] = []
    const previewRows: PreviewRow[] = []
    const skipped: { row: number; reason: string }[] = []
    let autoShade = 1

    const widthCol  = mapping.width
    const heightCol = mapping.height

    if (widthCol === undefined || heightCol === undefined) {
      return { items, previewRows, skipped }
    }

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i]
      const rowNum = i + 1

      if (r.every(c => String(c ?? '').trim() === '')) continue

      const widthRaw  = parseFloat(String(r[widthCol]  ?? ''))
      const heightRaw = parseFloat(String(r[heightCol] ?? ''))

      // Silently skip footer / totals / tax rows (no useful Width/Height).
      if (isNaN(widthRaw) || widthRaw <= 0 || isNaN(heightRaw) || heightRaw <= 0) continue

      const shadeCell = mapping.shade !== undefined ? String(r[mapping.shade] ?? '').trim() : ''
      const shade = shadeCell || String(autoShade++)

      const typeCell = mapping.type !== undefined ? String(r[mapping.type] ?? '').trim().toLowerCase() : ''
      const blindType: 'roller' | 'zebra' = typeCell === 'zebra' ? 'zebra' : 'roller'

      const valenceCell = mapping.valence !== undefined ? String(r[mapping.valence] ?? '').trim() : ''
      const valenceParsed = parseFloat(valenceCell)
      const valenceIn = valenceCell === '' || isNaN(valenceParsed) ? 6 : valenceParsed

      const qtyParsed = mapping.qty !== undefined ? parseInt(String(r[mapping.qty] ?? ''), 10) : NaN
      const qty = isNaN(qtyParsed) || qtyParsed < 1 ? 1 : qtyParsed

      const material = (mapping.material !== undefined ? String(r[mapping.material] ?? '').trim() : '') || 'Polyester'
      const color    = (mapping.color    !== undefined ? String(r[mapping.color]    ?? '').trim() : '') || 'White'
      const pattern  = (mapping.pattern  !== undefined ? String(r[mapping.pattern]  ?? '').trim() : '') || 'Plain'
      const widthsRaw = mapping.widths !== undefined ? String(r[mapping.widths] ?? '').trim() : ''

      let selectedWidths: number[]
      if (!widthsRaw || widthsRaw.toLowerCase() === 'all') {
        selectedWidths = [...availableWidths]
      } else {
        const parsed = widthsRaw.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v) && v > 0)
        selectedWidths = parsed
          .map(v => availableWidths.find(aw => Math.abs(aw - v) < 0.001))
          .filter((v): v is number => v !== undefined)
      }

      if (selectedWidths.length === 0) {
        if (availableWidths.length === 0) {
          skipped.push({ row: rowNum, reason: 'No roll widths configured in Settings' })
        } else {
          skipped.push({ row: rowNum, reason: `Roll widths "${widthsRaw}" not in configured widths` })
        }
        continue
      }

      const widthM   = widthRaw  * IN_TO_M
      const heightM  = heightRaw * IN_TO_M
      const valenceM = valenceIn * IN_TO_M
      const finalHeightM = blindType === 'zebra' ? heightM * 2 + valenceM : heightM + valenceM
      const maxW = Math.max(...selectedWidths)

      if (widthM > maxW && !(allowRotation && finalHeightM <= maxW)) {
        skipped.push({
          row: rowNum,
          reason: `${widthRaw}" wide won't fit on selected roll widths (max ${fmtRollWidth(maxW)})`,
        })
        continue
      }

      previewRows.push({
        rowNum, shade, type: blindType,
        widthIn: widthRaw, heightIn: heightRaw, valenceIn, qty,
        material, color, pattern,
        widthsLabel: selectedWidths.length === availableWidths.length
          ? 'All'
          : selectedWidths.map(fmtRollWidth).join(', '),
      })

      items.push({
        id: crypto.randomUUID(),
        shade_number: shade,
        blind_type: blindType,
        width: widthM,
        height: heightM,
        valence: valenceM,
        quantity: qty,
        material_type: material,
        color,
        pattern,
        selected_widths: selectedWidths,
        grain_locked: false,
      })
    }

    return { items, previewRows, skipped }
  }, [mapping, dataRows, availableWidths, allowRotation])

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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={16} className="text-brand-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Review Import</h2>
              <p className="text-[11px] text-surface-400 mt-0.5 truncate">
                <span className="font-medium">{fileName}</span> — check the column mapping and pieces below, then confirm.
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-surface-400 hover:text-surface-700 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Column mapping */}
          <div>
            <h3 className="text-[11px] font-bold text-surface-500 uppercase tracking-wider mb-2">Column Mapping</h3>
            <div className="bg-surface-50 border border-surface-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map(f => {
                const isMissing = f.required && mapping[f.key] === undefined
                return (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-surface-600 w-24 shrink-0">
                      {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                    </span>
                    <select
                      value={mapping[f.key] !== undefined ? String(mapping[f.key]) : '__default__'}
                      onChange={e => updateMapping(f.key, e.target.value)}
                      className={`flex-1 min-w-0 text-xs rounded-md border px-2 py-1.5 bg-white font-medium ${
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
          </div>

          {(widthMissing || heightMissing) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span><b>Width</b> and <b>Height</b> are required. Map them to columns above before importing.</span>
            </div>
          )}

          {/* Pieces preview */}
          <div>
            <h3 className="text-[11px] font-bold text-surface-500 uppercase tracking-wider mb-2">
              Pieces To Import <span className="text-brand-600">({computed.previewRows.length})</span>
            </h3>
            {computed.previewRows.length === 0 ? (
              <p className="text-xs text-surface-400 italic px-3 py-4 bg-surface-50 rounded-lg border border-surface-200">
                No valid rows yet — make sure <b>Width</b> and <b>Height</b> are mapped to numeric columns.
              </p>
            ) : (
              <div className="border border-surface-200 rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-surface-100 text-surface-600 uppercase tracking-wider font-bold sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left">Shade</th>
                        <th className="px-2 py-2 text-left">Type</th>
                        <th className="px-2 py-2 text-right">W (&quot;)</th>
                        <th className="px-2 py-2 text-right">H (&quot;)</th>
                        <th className="px-2 py-2 text-right">Val (&quot;)</th>
                        <th className="px-2 py-2 text-right">Qty</th>
                        <th className="px-2 py-2 text-left">Material</th>
                        <th className="px-2 py-2 text-left">Color</th>
                        <th className="px-2 py-2 text-left">Pattern</th>
                        <th className="px-2 py-2 text-left">Roll Widths</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computed.previewRows.map((p, i) => (
                        <tr key={i} className="border-t border-surface-100 hover:bg-surface-50">
                          <td className="px-2 py-1.5 font-mono font-bold text-surface-700">{p.shade}</td>
                          <td className="px-2 py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              p.type === 'zebra' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>{p.type}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">{p.widthIn}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{p.heightIn}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{p.valenceIn}</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold">{p.qty}</td>
                          <td className="px-2 py-1.5 text-surface-600">{p.material}</td>
                          <td className="px-2 py-1.5 text-surface-600">{p.color}</td>
                          <td className="px-2 py-1.5 text-surface-600">{p.pattern}</td>
                          <td className="px-2 py-1.5 text-[10px] text-surface-500">{p.widthsLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Skipped rows */}
          {computed.skipped.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-xs font-bold text-amber-700 mb-1.5 flex items-center gap-1.5">
                <AlertCircle size={12} />
                {computed.skipped.length} row{computed.skipped.length !== 1 ? 's' : ''} will be skipped
              </p>
              <ul className="text-[11px] text-amber-700/80 space-y-0.5 max-h-32 overflow-y-auto pl-5 list-disc">
                {computed.skipped.map((s, i) => (
                  <li key={i}>Row {s.row}: {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-surface-200 flex items-center justify-between gap-3">
          <div className="text-[11px] text-surface-500">
            {canImport ? (
              <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Ready to import {computed.items.length} piece{computed.items.length !== 1 ? 's' : ''}
              </span>
            ) : (
              <span>Adjust the column mapping to see pieces.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-bold text-surface-600 hover:text-surface-700 hover:bg-surface-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(computed.items)}
              disabled={!canImport}
              className="px-4 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-md hover:bg-brand-700 disabled:bg-surface-200 disabled:text-surface-400 disabled:cursor-not-allowed transition-colors"
            >
              Confirm &amp; Import
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
