'use client'

import { useState } from 'react'
import { WorkOrderItem } from '@/types'
import { Plus, Trash2, Layers, Hash, Ruler, ArrowUpDown } from 'lucide-react'

type Unit = 'm' | 'cm' | 'in'

const TO_METERS: Record<Unit, number> = { m: 1, cm: 0.01, in: 0.0254 }
const toM   = (v: number, u: Unit) => v * TO_METERS[u]
const fromM = (v: number, u: Unit) => v / TO_METERS[u]
const fmt   = (v: number) => v.toFixed(2)

interface Props {
  items: WorkOrderItem[]
  onChange: (items: WorkOrderItem[]) => void
  rollWidth?: number  // used for per-item width warning
}

export default function WorkOrderBuilder({ items, onChange, rollWidth }: Props) {
  const [unit, setUnit] = useState<Unit>('m')
  const [persistentShade, setPersistentShade] = useState('')

  const [form, setForm] = useState({
    shade_number: '',
    blind_type: 'roller' as 'roller' | 'zebra',
    width:    NaN,
    height:   NaN,
    valence:  NaN,
    quantity: NaN,
    material_type: 'Polyester',
    color:   'White',
    pattern: 'Plain',
  })

  const unitLabel = unit === 'in' ? '"' : unit

  const addItem = () => {
    if (!form.shade_number.trim())                          { alert('Enter Shade Number'); return }
    if (isNaN(form.width)  || form.width  <= 0)            { alert('Width must be > 0');  return }
    if (isNaN(form.height) || form.height <= 0)            { alert('Height must be > 0'); return }
    if (isNaN(form.quantity) || form.quantity < 1)         { alert('Quantity must be ≥ 1'); return }

    const widthM   = toM(form.width,                           unit)
    const heightM  = toM(form.height,                          unit)
    const valenceM = isNaN(form.valence) ? 0 : toM(form.valence, unit)

    if (rollWidth && widthM > rollWidth) {
      alert(
        `Blind width ${fmt(form.width)}${unitLabel} = ${widthM.toFixed(3)}m exceeds the selected roll width of ${rollWidth}m.\n\n` +
        `Either reduce the blind width, enable 90° rotation, or choose a wider roll.`
      )
      return
    }

    onChange([...items, {
      id: crypto.randomUUID(),
      shade_number:  form.shade_number,
      blind_type:    form.blind_type,
      width:         widthM,
      height:        heightM,
      valence:       valenceM,
      quantity:      form.quantity,
      material_type: form.material_type,
      color:         form.color,
      pattern:       form.pattern,
    }])

    setForm(f => ({ ...f, shade_number: persistentShade, width: NaN, height: NaN, valence: NaN, quantity: NaN }))
  }

  const removeItem = (id: string) => onChange(items.filter(i => i.id !== id))

  const finalHDisplay = (() => {
    if (isNaN(form.height)) return null
    const hM = toM(form.height, unit)
    const vM = isNaN(form.valence) ? 0 : toM(form.valence, unit)
    const finalM = form.blind_type === 'zebra' ? hM * 2 + vM : hM + vM
    return fromM(finalM, unit)
  })()

  const totalPieces = items.reduce((s, i) => s + (i.quantity || 0), 0)

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-brand-600" />
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Production List</h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Unit toggle */}
          <div className="flex items-center border border-surface-200 rounded-md overflow-hidden text-[11px] font-bold">
            {(['m', 'cm', 'in'] as Unit[]).map(u => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`px-2.5 py-1 transition-colors ${
                  unit === u ? 'bg-brand-600 text-white' : 'text-surface-500 hover:bg-surface-100'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          <span className="text-xs font-medium text-surface-400">{items.length} rows · {totalPieces} pcs</span>
        </div>
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
              onChange={e => { setForm(f => ({ ...f, shade_number: e.target.value })); setPersistentShade(e.target.value) }}
              placeholder="BR-001"
              className="w-full"
            />
          </div>
          <div className="col-span-3">
            <label className="flex items-center gap-1 text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              <Ruler size={10} /> W ({unitLabel})
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
              <ArrowUpDown size={10} /> H ({unitLabel})
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
              Val ({unitLabel})
            </label>
            <input
              type="number" step="any" min="0"
              value={isNaN(form.valence) ? '' : form.valence}
              onChange={e => setForm(f => ({ ...f, valence: parseFloat(e.target.value) || NaN }))}
              placeholder="—"
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
              {finalHDisplay === null ? '—' : `${fmt(finalHDisplay)}${unitLabel}`}
            </div>
          </div>
        </div>

        {/* Add Button */}
        <button
          onClick={addItem}
          className="w-full py-3 border-2 border-dashed border-surface-300 rounded-lg text-surface-400 text-xs font-bold uppercase tracking-wider hover:border-brand-400 hover:text-brand-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Add Piece to Order
        </button>

        {/* Items Table — values displayed in current unit, stored in meters */}
        {items.length > 0 && (
          <div className="border border-surface-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2.5 text-left   text-[10px] font-bold text-surface-400 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2.5 text-left   text-[10px] font-bold text-surface-400 uppercase tracking-wider">Shade #</th>
                  <th className="px-3 py-2.5 text-right  text-[10px] font-bold text-surface-400 uppercase tracking-wider">W×H ({unitLabel})</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-surface-400 uppercase tracking-wider">Val</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-surface-400 uppercase tracking-wider">Qty</th>
                  <th className="px-3 py-2.5 text-right  text-[10px] font-bold text-surface-400 uppercase tracking-wider">Final H</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-surface-400 uppercase tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {items.map(item => {
                  const w  = fromM(item.width, unit)
                  const h  = fromM(item.height, unit)
                  const v  = fromM(item.valence, unit)
                  const fhM = item.blind_type === 'zebra'
                    ? item.height * 2 + item.valence
                    : item.height + item.valence
                  const fh = fromM(fhM, unit)
                  const oversized = rollWidth ? item.width > rollWidth : false
                  return (
                    <tr key={item.id} className={`transition-colors ${oversized ? 'bg-red-50' : 'hover:bg-surface-50/80'}`}>
                      <td className="px-3 py-2.5">
                        <span className={`badge ${item.blind_type === 'zebra' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                          {item.blind_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-surface-700">{item.shade_number}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${oversized ? 'text-red-600 font-bold' : 'text-surface-600'}`}>
                        {fmt(w)} × {fmt(h)}
                        {oversized && <span className="ml-1 text-[10px]">⚠</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-surface-500">+{fmt(v)}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-brand-600">{fmt(fh)}{unitLabel}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => removeItem(item.id)} className="text-surface-400 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
