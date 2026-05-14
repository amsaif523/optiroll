'use client'

import { useState } from 'react'
import { WorkOrderItem } from '@/types'
import { Plus, Layers, Hash, Ruler, ArrowUpDown, RotateCcw } from 'lucide-react'

const IN_TO_M = 0.0254
const fmtDim = (v: number) => v.toFixed(5)

interface Props {
  items: WorkOrderItem[]
  onChange: (items: WorkOrderItem[]) => void
  availableWidths: number[]
  allowRotation: boolean
  onAllowRotationChange: (v: boolean) => void
}

export default function WorkOrderBuilder({
  items, onChange,
  availableWidths,
  allowRotation, onAllowRotationChange,
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
  })

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
          `Normal:  W ${form.width.toFixed(5)}" = ${widthM.toFixed(5)}m > ${maxSelected.toFixed(1)}m\n` +
          `Rotated: H ${(finalHeightM / IN_TO_M).toFixed(5)}" = ${finalHeightM.toFixed(5)}m > ${maxSelected.toFixed(1)}m\n\n` +
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
    }])
  }

  const finalHDisplay = (() => {
    if (isNaN(form.height)) return null
    const hM  = form.height * IN_TO_M
    const vM  = isNaN(form.valence) ? 0 : form.valence * IN_TO_M
    const fhM = form.blind_type === 'zebra' ? hM * 2 + vM : hM + vM
    return fhM / IN_TO_M  // back to inches for display
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
                      {w.toFixed(1)}m
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
                  : `${form.selected_widths.map(w => `${w.toFixed(1)}m`).join(', ')} selected.`}
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
        </div>

        <button
          onClick={addItem}
          className="w-full py-3 border-2 border-dashed border-surface-300 rounded-lg text-surface-400 text-xs font-bold uppercase tracking-wider hover:border-brand-400 hover:text-brand-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Add Piece to Order
        </button>
      </div>
    </div>
  )
}
