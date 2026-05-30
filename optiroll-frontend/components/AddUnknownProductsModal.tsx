'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, Plus, CheckCircle2 } from 'lucide-react'
import { getToken } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'
const UNITS = ['SQFT', 'MTR', 'PCS', 'RFT', 'NOS']

export interface ProductResolution {
  shade: string
  product_id: number
  product_code: string
}

interface UnknownRow {
  shade: string
  product_code: string
  unit: string
  sale_rate: string
  error: string
  done: boolean
}

interface Props {
  unknownShades: string[]
  onResolved: (mappings: ProductResolution[]) => void
  onSkip: () => void
}

export default function AddUnknownProductsModal({ unknownShades, onResolved, onSkip }: Props) {
  const [rows, setRows] = useState<UnknownRow[]>(
    unknownShades.map(shade => ({
      shade,
      product_code: '',
      unit: 'SQFT',
      sale_rate: '',
      error: '',
      done: false,
    }))
  )
  const [saving, setSaving] = useState(false)
  const [globalError, setGlobalError] = useState('')

  const updateRow = (idx: number, field: keyof UnknownRow, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value, error: '' } : r))
  }

  const handleAddAll = async () => {
    // Validate: all non-done rows need a product_code
    let hasError = false
    const validated = rows.map(r => {
      if (r.done) return r
      if (!r.product_code.trim()) {
        hasError = true
        return { ...r, error: 'Code required' }
      }
      return r
    })
    if (hasError) { setRows(validated); return }

    setSaving(true)
    setGlobalError('')
    const token = getToken()
    const mappings: ProductResolution[] = []
    const updatedRows = [...rows]

    for (let i = 0; i < updatedRows.length; i++) {
      const r = updatedRows[i]
      if (r.done) {
        // Already added in a previous attempt — find the mapping we stored
        const existing = mappings.find(m => m.shade === r.shade)
        if (existing) continue
      }
      try {
        const res = await fetch(`${API_BASE}/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            product_name: r.shade,
            product_code: r.product_code.trim(),
            unit: r.unit,
            sale_rate: r.sale_rate !== '' ? Number(r.sale_rate) : null,
          }),
        })
        const json = await res.json()
        if (!json.success) {
          updatedRows[i] = { ...r, error: json.error || 'Failed to add' }
        } else {
          updatedRows[i] = { ...r, done: true, error: '' }
          mappings.push({
            shade: r.shade,
            product_id: json.data.id,
            product_code: r.product_code.trim(),
          })
        }
      } catch {
        updatedRows[i] = { ...r, error: 'Network error' }
      }
    }

    setRows(updatedRows)
    setSaving(false)

    const anyError = updatedRows.some(r => !r.done && r.error)
    if (anyError) {
      setGlobalError('Some products could not be added. Fix the errors and try again.')
      return
    }

    onResolved(mappings)
  }

  const allDone = rows.every(r => r.done)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-surface-200 shrink-0">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <AlertCircle size={18} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-surface-800">Unknown Products in Import</h3>
            <p className="text-sm text-surface-500 mt-0.5">
              {rows.length} shade{rows.length !== 1 ? 's' : ''} not found in inventory. Add a product code for each, or skip to import without linking.
            </p>
          </div>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {globalError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              <AlertCircle size={14} /> {globalError}
            </div>
          )}

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-surface-400 uppercase tracking-wider px-1">
            <div className="col-span-4">Shade / Product Name</div>
            <div className="col-span-3">Product Code *</div>
            <div className="col-span-2">Unit</div>
            <div className="col-span-2">Sale Rate</div>
            <div className="col-span-1" />
          </div>

          {rows.map((row, idx) => (
            <div key={row.shade} className={`grid grid-cols-12 gap-2 items-start p-2 rounded-xl border transition-colors ${
              row.done ? 'bg-emerald-50 border-emerald-200' : row.error ? 'bg-red-50 border-red-200' : 'bg-surface-50 border-surface-200'
            }`}>
              <div className="col-span-4 py-2 px-1">
                <p className="text-sm font-medium text-surface-700 leading-tight truncate" title={row.shade}>{row.shade}</p>
              </div>
              <div className="col-span-3">
                {row.done ? (
                  <span className="text-sm font-mono text-emerald-700 py-2 px-1 block">{row.product_code}</span>
                ) : (
                  <input
                    type="text"
                    value={row.product_code}
                    onChange={e => updateRow(idx, 'product_code', e.target.value)}
                    placeholder="e.g. OS"
                    className={`w-full px-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono ${
                      row.error ? 'border-red-400 bg-red-50' : 'border-surface-200 bg-white'
                    }`}
                  />
                )}
                {row.error && <p className="text-[11px] text-red-600 mt-1 px-1">{row.error}</p>}
              </div>
              <div className="col-span-2">
                {row.done ? (
                  <span className="text-sm text-surface-600 py-2 px-1 block">{row.unit}</span>
                ) : (
                  <select
                    value={row.unit}
                    onChange={e => updateRow(idx, 'unit', e.target.value)}
                    className="w-full px-2 py-2 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                )}
              </div>
              <div className="col-span-2">
                {row.done ? (
                  <span className="text-sm text-surface-600 py-2 px-1 block">{row.sale_rate || '—'}</span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.sale_rate}
                    onChange={e => updateRow(idx, 'sale_rate', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2 py-2 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
              <div className="col-span-1 flex items-center justify-center py-2">
                {row.done && <CheckCircle2 size={16} className="text-emerald-500" />}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-100 flex items-center justify-between shrink-0">
          <button
            onClick={onSkip}
            className="text-sm text-surface-500 hover:text-surface-700 font-medium px-3 py-2 rounded-lg hover:bg-surface-100 transition-colors"
          >
            Skip — import without linking
          </button>
          <button
            onClick={handleAddAll}
            disabled={saving || allDone}
            className="btn-brand flex items-center gap-2 text-sm px-4 py-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {allDone ? 'All Added' : `Add ${rows.filter(r => !r.done).length} to Inventory`}
          </button>
        </div>
      </div>
    </div>
  )
}
