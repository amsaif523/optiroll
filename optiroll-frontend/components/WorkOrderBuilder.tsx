'use client'

import { useState } from 'react'
import { WorkOrderItem } from '@/types'
import { Plus, Trash2, Layers, Hash, Ruler, ArrowUpDown } from 'lucide-react'

interface Props {
  items: WorkOrderItem[]
  onChange: (items: WorkOrderItem[]) => void
}

export default function WorkOrderBuilder({ items, onChange }: Props) {
  const [persistentShade, setPersistentShade] = useState('')

  const [form, setForm] = useState<WorkOrderItem>({
    id: '',
    shade_number: '',
    blind_type: 'roller',
    width: 0.8,
    height: NaN,
    valence: NaN,
    quantity: NaN,
    material_type: 'Polyester',
    color: 'White',
    pattern: 'Plain',
  })

  const addItem = () => {
    if (!form.shade_number.trim()) { alert('Enter Shade Number'); return }
    if (!form.height || form.height <= 0) { alert('Height must be > 0'); return }
    if (!form.width || form.width <= 0) { alert('Width must be > 0'); return }
    if (!form.quantity || form.quantity < 1) { alert('Quantity must be ≥ 1'); return }

    onChange([...items, { ...form, id: crypto.randomUUID() }])

    setForm({
      ...form,
      shade_number: persistentShade,
      width: 0.8,
      height: NaN,
      valence: NaN,
      quantity: NaN,
    })
  }

  const removeItem = (id: string) => onChange(items.filter(i => i.id !== id))

  const totalPieces = items.reduce((s, i) => s + (i.quantity || 0), 0)

  const finalH = form.blind_type === 'zebra'
    ? ((form.height || 0) * 2 + (form.valence || 0)).toFixed(2)
    : ((form.height || 0) + (form.valence || 0)).toFixed(2)

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-brand-600" />
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Production List</h3>
        </div>
        <span className="text-xs font-medium text-surface-400">{items.length} rows · {totalPieces} pcs</span>
      </div>

      <div className="panel-body space-y-4">
        {/* Type Toggle */}
        <div className="flex gap-1 p-1 bg-surface-100 rounded-lg">
          {(['roller','zebra'] as const).map(t => (
            <button
              key={t}
              onClick={() => setForm({...form, blind_type: t})}
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
              onChange={e => {
                const val = e.target.value
                setForm({...form, shade_number: val})
                setPersistentShade(val)
              }}
              placeholder="BR-001"
              className="w-full"
            />
          </div>
          <div className="col-span-3">
            <label className="flex items-center gap-1 text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              <Ruler size={10} /> Width (m)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.1"
              value={form.width || ''}
              onChange={e => setForm({...form, width: parseFloat(e.target.value) || 0})}
              className="w-full text-center"
            />
          </div>
          <div className="col-span-4">
            <label className="flex items-center gap-1 text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              <ArrowUpDown size={10} /> Height (m)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.1"
              value={isNaN(form.height) ? '' : form.height}
              onChange={e => setForm({...form, height: parseFloat(e.target.value) || NaN})}
              placeholder="—"
              className="w-full text-center placeholder:text-surface-300"
            />
          </div>
        </div>

        {/* Row 2: Valence, Qty, Material */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              Valence (m)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={isNaN(form.valence) ? '' : form.valence}
              onChange={e => setForm({...form, valence: parseFloat(e.target.value) || NaN})}
              placeholder="—"
              className="w-full text-center placeholder:text-surface-300"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              Qty
            </label>
            <input
              type="number"
              min="1"
              value={isNaN(form.quantity) ? '' : form.quantity}
              onChange={e => setForm({...form, quantity: parseInt(e.target.value) || NaN})}
              placeholder="—"
              className="w-full text-center placeholder:text-surface-300"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              Material
            </label>
            <input
              value={form.material_type}
              onChange={e => setForm({...form, material_type: e.target.value})}
              className="w-full"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              Color
            </label>
            <input
              value={form.color}
              onChange={e => setForm({...form, color: e.target.value})}
              className="w-full"
            />
          </div>
        </div>

        {/* Row 3: Pattern + Final Height (full width) */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              Pattern
            </label>
            <input
              value={form.pattern}
              onChange={e => setForm({...form, pattern: e.target.value})}
              className="w-full"
            />
          </div>
          <div className="col-span-6">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
              Final Height
            </label>
            <div className={`bg-surface-100 border border-surface-200 rounded-lg px-2 py-[9px] text-sm font-mono font-bold text-center ${
              isNaN(form.height) ? 'text-surface-400' : 'text-brand-600'
            }`}>
              {isNaN(form.height) ? '—' : `${finalH}m`}
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

        {/* Items Table */}
        {items.length > 0 && (
          <div className="border border-surface-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold text-surface-400 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold text-surface-400 uppercase tracking-wider">Shade #</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold text-surface-400 uppercase tracking-wider">W×H</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-surface-400 uppercase tracking-wider">Val</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-surface-400 uppercase tracking-wider">Qty</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold text-surface-400 uppercase tracking-wider">Final H</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold text-surface-400 uppercase tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {items.map(item => {
                  const fh = item.blind_type === 'zebra'
                    ? (item.height*2+item.valence).toFixed(2)
                    : (item.height+item.valence).toFixed(2)
                  return (
                    <tr key={item.id} className="hover:bg-surface-50/80 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className={`badge ${item.blind_type==='zebra'?'bg-purple-50 text-purple-700 border border-purple-200':'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                          {item.blind_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-surface-700">{item.shade_number}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-surface-600">
                        {item.width.toFixed(2)} × {item.height.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center text-surface-500">+{item.valence.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-brand-600">{fh}m</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-surface-400 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded"
                        >
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