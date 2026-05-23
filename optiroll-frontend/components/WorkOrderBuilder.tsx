'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { WorkOrderItem } from '@/types'
import { Plus, Layers, Hash, Ruler, ArrowUpDown, RotateCcw, Upload, Download, X, Scissors } from 'lucide-react'
import ImportPreviewModal, { FieldKey } from './ImportPreviewModal'

const IN_TO_M = 0.0254
const fmtDim = (v: number) => v.toFixed(5)
const fmtRollWidth = (v: number) => `${v.toFixed(3).replace(/\.?0+$/, '')}m`

interface Props {
  items: WorkOrderItem[]
  onChange: (items: WorkOrderItem[]) => void
  availableWidths: number[]
  allowRotation: boolean
  onAllowRotationChange: (v: boolean) => void
  cutMode: 'free' | 'guillotine'
  onCutModeChange: (v: 'free' | 'guillotine') => void
}

interface ImportResult {
  imported: number
  skipped: { row: number; reason: string }[]
}

export default function WorkOrderBuilder({
  items, onChange,
  availableWidths,
  allowRotation, onAllowRotationChange,
  cutMode, onCutModeChange,
}: Props) {
  const [form, setForm] = useState({
    shade_number: '',
    blind_type: 'roller' as 'roller' | 'zebra',
    width:    NaN,
    height:   NaN,
    valence:  6,
    quantity: NaN,
    material_type: 'Polyester',
    color:   'White',
    pattern: 'Plain',
    selected_widths: [] as number[],
    grain_locked: false,
  })

  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importPreview, setImportPreview] = useState<{
    fileName: string
    headerCells: string[]
    dataRows: unknown[][]
    initialMapping: Partial<Record<FieldKey, number>>
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleWidth = (w: number) => {
    const next = form.selected_widths.includes(w)
      ? form.selected_widths.filter(x => x !== w)
      : [...form.selected_widths, w].sort((a, b) => a - b)
    setForm(f => ({ ...f, selected_widths: next }))
  }

  const addItem = () => {
    if (!form.shade_number.trim())                 { alert('Enter Shade Number'); return }
    if (isNaN(form.width)  || form.width  <= 0)   { alert('Width must be > 0');  return }
    if (isNaN(form.height) || form.height <= 0)   { alert('Height must be > 0'); return }
    if (isNaN(form.quantity) || form.quantity < 1) { alert('Quantity must be ≥ 1'); return }
    if (form.selected_widths.length === 0)         { alert('Select at least one roll width for this piece'); return }

    const widthM   = form.width  * IN_TO_M
    const heightM  = form.height * IN_TO_M
    const valenceM = isNaN(form.valence) ? 0 : form.valence * IN_TO_M
    const finalHeightM = form.blind_type === 'zebra' ? heightM * 2 + valenceM : heightM + valenceM

    const maxSelected = Math.max(...form.selected_widths)
    const fitsNormal  = widthM <= maxSelected
    const fitsRotated = allowRotation && finalHeightM <= maxSelected
    if (!fitsNormal && !fitsRotated) {
      if (allowRotation) {
        alert(
          `Cannot fit even with 90° rotation.\n\n` +
          `Normal:  W ${form.width.toFixed(5)}" = ${widthM.toFixed(5)}m > ${fmtRollWidth(maxSelected)}\n` +
          `Rotated: H ${(finalHeightM / IN_TO_M).toFixed(5)}" = ${finalHeightM.toFixed(5)}m > ${fmtRollWidth(maxSelected)}\n\n` +
          `Select a wider roll or reduce the piece dimensions.`
        )
      } else {
        alert(
          `Blind width ${form.width.toFixed(5)}" = ${widthM.toFixed(5)}m exceeds all selected roll widths.\n\n` +
          `Either reduce the blind width, enable 90° rotation, or select a wider roll.`
        )
      }
      return
    }

    onChange([...items, {
      id: crypto.randomUUID(),
      shade_number:   form.shade_number,
      blind_type:     form.blind_type,
      width:          widthM,
      height:         heightM,
      valence:        valenceM,
      quantity:       form.quantity,
      material_type:  form.material_type,
      color:          form.color,
      pattern:        form.pattern,
      selected_widths: form.selected_widths,
      grain_locked:   form.grain_locked,
    }])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (rows.length === 0) {
          alert('The file is empty.')
          return
        }

        // Auto-detect the header row: scan the first 25 rows for one containing
        // both a "width" and "height" cell. Tolerates vendor preamble (A/c name,
        // date, Vch No, blank spacer rows) before the real table.
        let headerIdx = -1
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
          const cells = rows[i].map(c => String(c ?? '').toLowerCase().trim())
          const hasW = cells.some(c => (c.includes('width') && !c.includes('roll')) || c === 'w' || c.startsWith('w ('))
          const hasH = cells.some(c => c.includes('height') || c === 'h' || c.startsWith('h ('))
          if (hasW && hasH) { headerIdx = i; break }
        }
        if (headerIdx === -1) {
          alert('Could not find a header row. The file must contain a row with both "Width" and "Height" columns.')
          return
        }

        const headerCells = (rows[headerIdx] as unknown[]).map(c => String(c ?? '').trim())
        const dataRows = rows.slice(headerIdx + 1)

        // Initial mapping — best-guess column for each field by header keyword.
        // Iterates keywords in priority order so e.g. a "Shade #" column always
        // wins over a "Sr No." fallback, even when "Sr No." appears first in the row.
        const findCol = (...keywords: string[]): number | undefined => {
          for (const k of keywords) {
            for (let i = 0; i < headerCells.length; i++) {
              const h = headerCells[i].toLowerCase()
              if (h && h.includes(k)) return i
            }
          }
          return undefined
        }

        // Width must NOT match "Roll Widths".
        let widthCol: number | undefined
        for (let i = 0; i < headerCells.length; i++) {
          const h = headerCells[i].toLowerCase()
          if ((h.includes('width') || h === 'w' || h.startsWith('w (')) && !h.includes('roll')) { widthCol = i; break }
        }

        const initial: Partial<Record<FieldKey, number>> = {}
        const shade    = findCol('product name', 'item name', 'shade', 'sr no', 'sr.', 's.no', 'sl no', 'sno')
        if (shade    !== undefined) initial.shade = shade
        const type     = findCol('type', 'blind type')
        if (type     !== undefined) initial.type = type
        if (widthCol !== undefined) initial.width = widthCol
        const height   = findCol('height')
        if (height   !== undefined) initial.height = height
        const valence  = findCol('valence', 'val (')
        if (valence  !== undefined) initial.valence = valence
        // Pcs preferred over Qty/Quantity — for vendor quotes "Quantity" is often the SQFT total.
        const qty      = findCol('pcs', 'qty', 'quantity')
        if (qty      !== undefined) initial.qty = qty
        const material = findCol('material')
        if (material !== undefined) initial.material = material
        const color    = findCol('color', 'colour')
        if (color    !== undefined) initial.color = color
        const pattern  = findCol('pattern')
        if (pattern  !== undefined) initial.pattern = pattern
        const widths   = findCol('roll widths', 'roll width')
        if (widths   !== undefined) initial.widths = widths

        setImportPreview({ fileName: file.name, headerCells, dataRows, initialMapping: initial })
      } catch {
        alert('Failed to read the file. Make sure it is a valid .xlsx, .xls, or .csv file.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleConfirmImport = (newItems: WorkOrderItem[]) => {
    if (newItems.length > 0) onChange([...items, ...newItems])
    setImportResult({ imported: newItems.length, skipped: [] })
    setImportPreview(null)
  }

  const finalHDisplay = (() => {
    if (isNaN(form.height)) return null
    const hM  = form.height * IN_TO_M
    const vM  = isNaN(form.valence) ? 0 : form.valence * IN_TO_M
    const fhM = form.blind_type === 'zebra' ? hM * 2 + vM : hM + vM
    return fhM / IN_TO_M
  })()

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-brand-600" />
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Production List</h3>
        </div>
        <span className="text-[11px] font-bold text-surface-400 bg-surface-100 px-2 py-1 rounded-md">inches (″)</span>
      </div>

      <div className="panel-body space-y-4">

        {/* Excel import bar */}
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-dashed border-emerald-400 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
          >
            <Upload size={13} /> Import Excel
          </button>
          <a
            href="/optiroll-import-template.xlsx"
            download
            title="Download CSV template"
            className="flex items-center gap-1.5 py-2 px-3 rounded-lg border border-surface-200 bg-white text-surface-500 text-xs font-bold hover:bg-surface-50 transition-colors"
          >
            <Download size={13} /> Template
          </a>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Import result banner */}
        {importResult && (
          <div className={`rounded-lg border px-3 py-2.5 text-xs ${
            importResult.skipped.length === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : importResult.imported === 0
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <p className="font-bold">
                  {importResult.imported > 0
                    ? `✓ ${importResult.imported} piece${importResult.imported !== 1 ? 's' : ''} imported`
                    : '✗ No pieces imported'}
                  {importResult.skipped.length > 0 && ` · ${importResult.skipped.length} row${importResult.skipped.length !== 1 ? 's' : ''} skipped`}
                </p>
                {importResult.skipped.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] opacity-80">
                    {importResult.skipped.map(s => (
                      <li key={s.row}>Row {s.row}: {s.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={() => setImportResult(null)} className="shrink-0 opacity-60 hover:opacity-100">
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Blind type toggle */}
        <div className="flex gap-1 p-1 bg-surface-100 rounded-lg">
          {(['roller', 'zebra'] as const).map(t => (
            <button
              key={t}
              onClick={() => setForm(f => ({ ...f, blind_type: t }))}
              className={`flex-1 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                form.blind_type === t
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-surface-500 hover:text-surface-700 hover:bg-surface-200'
              }`}
            >
              {t === 'roller' ? 'Roller' : 'Zebra'}
            </button>
          ))}
        </div>

        {/* Row 1: Shade, Width, Height */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-5">
            <label className="flex items-center gap-1 text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              <Hash size={10} /> Shade #
            </label>
            <input
              value={form.shade_number}
              onChange={e => setForm(f => ({ ...f, shade_number: e.target.value }))}
              placeholder="BR-001"
              className="w-full"
            />
          </div>
          <div className="col-span-3">
            <label className="flex items-center gap-1 text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              <Ruler size={10} /> W (&quot;)
            </label>
            <input
              type="number" step="any" min="0"
              value={isNaN(form.width) ? '' : form.width}
              onChange={e => setForm(f => ({ ...f, width: parseFloat(e.target.value) || NaN }))}
              placeholder="—"
              className="w-full text-center placeholder:text-surface-300"
            />
          </div>
          <div className="col-span-4">
            <label className="flex items-center gap-1 text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              <ArrowUpDown size={10} /> H (&quot;)
            </label>
            <input
              type="number" step="any" min="0"
              value={isNaN(form.height) ? '' : form.height}
              onChange={e => setForm(f => ({ ...f, height: parseFloat(e.target.value) || NaN }))}
              placeholder="—"
              className="w-full text-center placeholder:text-surface-300"
            />
          </div>
        </div>

        {/* Row 2: Valence, Qty, Material, Color */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              Val (&quot;)
            </label>
            <input
              type="number" step="any" min="0"
              value={isNaN(form.valence) ? '' : form.valence}
              onChange={e => setForm(f => ({ ...f, valence: parseFloat(e.target.value) || NaN }))}
              placeholder="6"
              className="w-full text-center placeholder:text-surface-300"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Qty</label>
            <input
              type="number" min="1"
              value={isNaN(form.quantity) ? '' : form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || NaN }))}
              placeholder="—"
              className="w-full text-center placeholder:text-surface-300"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Material</label>
            <input value={form.material_type} onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))} className="w-full" />
          </div>
          <div className="col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Color</label>
            <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-full" />
          </div>
        </div>

        {/* Row 3: Pattern + Final Height */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Pattern</label>
            <input value={form.pattern} onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))} className="w-full" />
          </div>
          <div className="col-span-6">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Final Height</label>
            <div className={`bg-surface-100 border border-surface-200 rounded-lg px-2 py-[9px] text-sm font-mono font-bold text-center ${
              finalHDisplay === null ? 'text-surface-400' : 'text-brand-600'
            }`}>
              {finalHDisplay === null ? '—' : `${fmtDim(finalHDisplay)}"`}
            </div>
          </div>
        </div>

        {/* Per-piece roll widths + rotation toggle */}
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-3 space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-2">
              Roll Width for This Piece
            </label>
            {availableWidths.length === 0 ? (
              <p className="text-[10px] text-surface-400">No roll widths configured. Go to Settings.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableWidths.map(w => {
                  const selected = form.selected_widths.includes(w)
                  return (
                    <button
                      key={w}
                      onClick={() => toggleWidth(w)}
                      className={`py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                        selected
                          ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-500/30'
                          : 'bg-white text-surface-500 border border-surface-200 hover:bg-surface-100'
                      }`}
                    >
                      {fmtRollWidth(w)}
                    </button>
                  )
                })}
              </div>
            )}
            <p className={`text-[10px] mt-1.5 font-medium ${form.selected_widths.length === 0 ? 'text-red-500' : 'text-surface-400'}`}>
              {form.selected_widths.length === 0
                ? '⚠ Select at least one roll width for this piece.'
                : form.selected_widths.length === availableWidths.length
                  ? 'All widths selected — optimizer picks best for this piece.'
                  : `${form.selected_widths.map(fmtRollWidth).join(', ')} selected.`}
            </p>

          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw size={14} className="text-surface-500" />
              <span className="text-xs font-semibold text-surface-600">Allow 90° Rotation</span>
            </div>
            <button
              onClick={() => onAllowRotationChange(!allowRotation)}
              className={`relative w-10 h-5 rounded-full transition-colors ${allowRotation ? 'bg-brand-600' : 'bg-surface-300'}`}
            >
              <span className={`absolute top-[2px] left-[2px] w-[17px] h-[17px] bg-white rounded-full shadow transition-transform ${allowRotation ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Cut Mode toggle: guillotine = real cross-cuts, free = max density */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Scissors size={14} className="text-surface-500" />
              <span className="text-xs font-semibold text-surface-600">Cut Mode</span>
            </div>
            <div className="flex gap-1 p-1 bg-white border border-surface-200 rounded-lg">
              {(['guillotine', 'free'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => onCutModeChange(m)}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${
                    cutMode === m
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-surface-500 hover:bg-surface-100'
                  }`}
                >
                  {m === 'guillotine' ? 'Guillotine' : 'Free'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-surface-400 leading-snug">
              {cutMode === 'guillotine'
                ? 'Straight cross-cuts only — always cuttable on a real fabric machine.'
                : 'Max density (MAXRECTS) — may need non-straight cuts.'}
            </p>
          </div>
        </div>

        <button
          onClick={addItem}
          className="w-full py-3 border-2 border-dashed border-surface-300 rounded-lg text-surface-400 text-xs font-bold uppercase tracking-wider hover:border-brand-400 hover:text-brand-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Add Piece to Order
        </button>
      </div>

      {importPreview && (
        <ImportPreviewModal
          fileName={importPreview.fileName}
          headerCells={importPreview.headerCells}
          dataRows={importPreview.dataRows}
          initialMapping={importPreview.initialMapping}
          availableWidths={availableWidths}
          allowRotation={allowRotation}
          onCancel={() => setImportPreview(null)}
          onConfirm={handleConfirmImport}
        />
      )}
    </div>
  )
}
