'use client'

import { useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { WorkOrderItem } from '@/types'
import { Plus, Layers, Hash, Ruler, ArrowUpDown, RotateCcw, Upload, Download, X, Scissors, Search, PackagePlus } from 'lucide-react'
import ImportPreviewModal, { FieldKey } from './ImportPreviewModal'
import AddUnknownProductsModal, { ProductResolution } from './AddUnknownProductsModal'
import { getToken } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

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

interface ProductSuggestion {
  id: number
  product_name: string
  product_code: string
  unit: string
  sale_rate: number | null
}

export default function WorkOrderBuilder({
  items, onChange,
  availableWidths,
  allowRotation, onAllowRotationChange,
  cutMode, onCutModeChange,
}: Props) {
  const [form, setForm] = useState({
    shade_number: '',
    product_id:   null as number | null,
    product_code: null as string | null,
    blind_type: 'roller' as 'roller' | 'zebra',
    width:    NaN,
    cut:      1,
    height:   NaN,
    valence:  6,
    quantity: NaN,
    material_type: 'Polyester',
    color:   'White',
    pattern: 'Plain',
    selected_widths: [] as number[],
    grain_locked: false,
  })
  const [cutRaw, setCutRaw] = useState<string>('1')

  // Product autocomplete
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Post-import unknown products modal
  const [pendingItems, setPendingItems] = useState<WorkOrderItem[]>([])
  const [unknownShades, setUnknownShades] = useState<string[]>([])
  const [showUnknownModal, setShowUnknownModal] = useState(false)

  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importPreview, setImportPreview] = useState<{
    fileName: string
    headerCells: string[]
    dataRows: unknown[][]
    initialMapping: Partial<Record<FieldKey, number>>
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) { setSuggestions([]); setShowSuggestions(false); return }
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE}/products?q=${encodeURIComponent(q)}&limit=10`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      })
      const json = await res.json()
      if (json.success) {
        setSuggestions(json.data.rows || [])
        setShowSuggestions(true)
      }
    } catch { /* ignore */ }
  }, [])

  const handleShadeChange = (value: string) => {
    setForm(f => ({ ...f, shade_number: value, product_id: null, product_code: null }))
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    suggestTimer.current = setTimeout(() => fetchSuggestions(value), 200)
  }

  const selectProduct = (p: ProductSuggestion) => {
    setForm(f => ({ ...f, shade_number: p.product_name, product_id: p.id, product_code: p.product_code }))
    setShowSuggestions(false)
    setSuggestions([])
  }

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

    const cutIn    = isNaN(form.cut) ? 0 : Math.max(0, form.cut)
    if (cutIn >= form.width) { alert('Cut must be less than Width'); return }
    const widthM   = form.width  * IN_TO_M
    const cutM     = cutIn * IN_TO_M
    const effWidthM = widthM - cutM   // fabric width packed/plotted = width − cut
    const heightM  = form.height * IN_TO_M
    const valenceM = isNaN(form.valence) ? 0 : form.valence * IN_TO_M
    const finalHeightM = form.blind_type === 'zebra' ? heightM * 2 + valenceM : heightM + valenceM

    const maxSelected = Math.max(...form.selected_widths)
    const fitsNormal  = effWidthM <= maxSelected
    const fitsRotated = allowRotation && finalHeightM <= maxSelected
    if (!fitsNormal && !fitsRotated) {
      const cutNote = cutIn > 0 ? ` (after ${cutIn}" cut)` : ''
      if (allowRotation) {
        alert(
          `Cannot fit even with 90° rotation.\n\n` +
          `Normal:  fabric W${cutNote} ${(effWidthM / IN_TO_M).toFixed(5)}" = ${effWidthM.toFixed(5)}m > ${fmtRollWidth(maxSelected)}\n` +
          `Rotated: H ${(finalHeightM / IN_TO_M).toFixed(5)}" = ${finalHeightM.toFixed(5)}m > ${fmtRollWidth(maxSelected)}\n\n` +
          `Select a wider roll or reduce the piece dimensions.`
        )
      } else {
        alert(
          `Fabric width${cutNote} ${(effWidthM / IN_TO_M).toFixed(5)}" = ${effWidthM.toFixed(5)}m exceeds all selected roll widths.\n\n` +
          `Either reduce the blind width, enable 90° rotation, or select a wider roll.`
        )
      }
      return
    }

    onChange([...items, {
      id: crypto.randomUUID(),
      shade_number:   form.shade_number,
      product_id:     form.product_id,
      product_code:   form.product_code,
      blind_type:     form.blind_type,
      width:          widthM,
      cut:            cutM,
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
        const cut      = findCol('cut', 'mechanism', 'deduction')
        if (cut      !== undefined) initial.cut = cut
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

  const handleConfirmImport = async (newItems: WorkOrderItem[]) => {
    setImportPreview(null)
    if (newItems.length === 0) return

    // Deduplicate shade_numbers, then look them up in inventory
    const seen = new Set<string>()
    const shadeNames = newItems.map(i => i.shade_number).filter(s => { if (!s || seen.has(s)) return false; seen.add(s); return true })
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE}/products/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ names: shadeNames }),
      })
      const json = await res.json()
      if (json.success) {
        const { found, unknown } = json.data as { found: { id: number; product_name: string; product_code: string; searched_name: string }[]; unknown: string[] }
        // Enrich items with product info where matched
        const enriched = newItems.map(item => {
          const match = found.find(p => p.searched_name === item.shade_number)
          return match ? { ...item, product_id: match.id, product_code: match.product_code } : item
        })
        if (unknown.length > 0) {
          setPendingItems(enriched)
          setUnknownShades(unknown)
          setShowUnknownModal(true)
        } else {
          onChange([...items, ...enriched])
          setImportResult({ imported: enriched.length, skipped: [] })
        }
        return
      }
    } catch { /* fall through */ }

    // Fallback: add without product linking
    onChange([...items, ...newItems])
    setImportResult({ imported: newItems.length, skipped: [] })
  }

  const handleUnknownResolved = (mappings: ProductResolution[]) => {
    const enriched = pendingItems.map(item => {
      const m = mappings.find(m => m.shade === item.shade_number)
      return m ? { ...item, product_id: m.product_id, product_code: m.product_code } : item
    })
    onChange([...items, ...enriched])
    setImportResult({ imported: enriched.length, skipped: [] })
    setShowUnknownModal(false)
    setPendingItems([])
    setUnknownShades([])
  }

  const handleUnknownSkip = () => {
    onChange([...items, ...pendingItems])
    setImportResult({ imported: pendingItems.length, skipped: [] })
    setShowUnknownModal(false)
    setPendingItems([])
    setUnknownShades([])
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

        {/* Row 1: Shade, Width, Cut, Height */}
        <div className="grid grid-cols-12 gap-3 items-start">
          <div className="col-span-4">
            <label className="flex items-center gap-1 text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              <Hash size={10} /> Shade #
            </label>
            <div className="relative">
              <input
                value={form.shade_number}
                onChange={e => handleShadeChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Type to search…"
                className="w-full pr-7"
              />
              <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-300 pointer-events-none" />
              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 left-0 top-full mt-1 min-w-[340px] w-max max-w-[480px] bg-white border border-surface-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                  {suggestions.map(p => (
                    <button
                      key={p.id}
                      onMouseDown={() => selectProduct(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-brand-50 flex items-center gap-3 border-b border-surface-50 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-surface-800 font-medium leading-tight">{p.product_name}</p>
                        {p.unit && <p className="text-[11px] text-surface-400 mt-0.5">{p.unit}{p.sale_rate != null ? ` · ${p.sale_rate}` : ''}</p>}
                      </div>
                      <span className="text-[11px] font-mono bg-surface-100 text-surface-600 px-2 py-0.5 rounded shrink-0">{p.product_code}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Not-in-inventory badge */}
              {form.shade_number && !form.product_id && !showSuggestions && (
                <div className="absolute z-40 left-0 right-0 top-full mt-1 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <PackagePlus size={12} className="text-amber-600 shrink-0" />
                  <span className="text-[11px] text-amber-700">Not in inventory</span>
                </div>
              )}
            </div>
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
          <div className="col-span-2">
            <label className="flex items-center gap-1 text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5" title="Mechanism deduction — subtracted from width before cutting">
              <Scissors size={10} /> Cut (&quot;)
            </label>
            <input
              type="text" inputMode="decimal"
              value={cutRaw}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9.]/g, '')
                setCutRaw(raw)
                const v = parseFloat(raw)
                if (!isNaN(v) && v >= 0) setForm(f => ({ ...f, cut: v }))
              }}
              placeholder="0"
              className="w-full text-center placeholder:text-surface-300"
            />
          </div>
          <div className="col-span-3">
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

        {/* Fabric width after cut — only shown when a mechanism deduction is set */}
        {!isNaN(form.width) && form.cut > 0 && (
          <div className="flex items-center gap-2 -mt-1 text-[11px]">
            <span className="text-surface-400">Fabric width after cut:</span>
            <span className={`font-mono font-bold ${form.cut < form.width ? 'text-brand-600' : 'text-red-500'}`}>
              {form.cut < form.width ? `${fmtDim(form.width - form.cut)}"` : 'invalid (cut ≥ width)'}
            </span>
            <span className="text-surface-400">· mechanism space {fmtDim(form.cut)}&quot;</span>
          </div>
        )}

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

      {showUnknownModal && (
        <AddUnknownProductsModal
          unknownShades={unknownShades}
          onResolved={handleUnknownResolved}
          onSkip={handleUnknownSkip}
        />
      )}
    </div>
  )
}
