'use client'

import { useState, useEffect } from 'react'
import { Settings, Plus, Trash2, Save, RotateCcw, Ruler, Gauge, Recycle } from 'lucide-react'
import { getToken } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

interface AppSettings {
  roll_widths: number[]
  max_roll_length: number
  leftover_reuse_threshold: number  // 0–1, fraction of effective roll width
}

interface Props {
  onSettingsChange?: (settings: AppSettings) => void
}

const DEFAULT_SETTINGS: AppSettings = {
  roll_widths: [2.0, 2.5, 2.8, 2.9, 3.0],
  max_roll_length: 30,
  leftover_reuse_threshold: 0.8,
}
const fmtRollWidth = (v: number) => `${v.toFixed(3).replace(/\.?0+$/, '')}m`

export default function SettingsPanel({ onSettingsChange }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [newWidth, setNewWidth] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getToken()
    fetch(`${API_BASE}/settings`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          const t = parseFloat(data.data.leftover_reuse_threshold)
          const s: AppSettings = {
            roll_widths: Array.isArray(data.data.roll_widths) ? data.data.roll_widths : DEFAULT_SETTINGS.roll_widths,
            max_roll_length: typeof data.data.max_roll_length === 'number' ? data.data.max_roll_length : DEFAULT_SETTINGS.max_roll_length,
            leftover_reuse_threshold: Number.isFinite(t) && t > 0 && t <= 1 ? t : DEFAULT_SETTINGS.leftover_reuse_threshold,
          }
          setSettings(s)
          onSettingsChange?.(s)
        }
      })
      .catch(() => {})
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    setError('')
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          roll_widths: settings.roll_widths,
          max_roll_length: settings.max_roll_length,
          leftover_reuse_threshold: settings.leftover_reuse_threshold,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSettingsChange?.(settings)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    }
    setSaving(false)
  }

  const addWidth = () => {
    const w = parseFloat(newWidth)
    if (isNaN(w) || w <= 0 || w > 10) { setError('Width must be between 0 and 10 m'); return }
    if (settings.roll_widths.includes(w)) { setError('Width already exists'); return }
    setSettings(s => ({ ...s, roll_widths: [...s.roll_widths, w].sort((a, b) => a - b) }))
    setNewWidth('')
    setError('')
  }

  const removeWidth = (w: number) => {
    if (settings.roll_widths.length <= 1) { setError('At least one roll width is required'); return }
    setSettings(s => ({ ...s, roll_widths: s.roll_widths.filter(x => x !== w) }))
    setError('')
  }

  const resetDefaults = () => {
    setSettings(DEFAULT_SETTINGS)
    setError('')
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-8 space-y-5">
        <div className="panel overflow-hidden">
          <div className="panel-header bg-surface-50">
            <div className="flex items-center gap-2">
              <Ruler size={16} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Roll Width Options</h3>
            </div>
            <button onClick={resetDefaults} className="btn-ghost flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-600">
              <RotateCcw size={13} /> Reset defaults
            </button>
          </div>
          <div className="panel-body space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-surface-700">Allowed production roll widths</p>
                <p className="text-xs text-surface-400 mt-1">Operators choose from these meter widths while adding each piece.</p>
              </div>
              <span className="badge bg-brand-50 text-brand-700 border border-brand-200">{settings.roll_widths.length} widths</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {settings.roll_widths.map(w => (
                <div key={w} className="flex items-center justify-between bg-white border border-surface-200 rounded-lg px-3 py-3 shadow-sm">
                  <span className="text-sm font-black text-surface-800">{fmtRollWidth(w)}</span>
                  <button onClick={() => removeWidth(w)} className="text-surface-300 hover:text-red-500 transition-colors" title="Remove width">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-surface-50 border border-surface-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={newWidth}
                  onChange={e => setNewWidth(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addWidth()}
                  placeholder="e.g. 3.2"
                  className="w-36 text-center"
                />
                <span className="text-sm text-surface-500 font-medium">meters</span>
              </div>
              <button onClick={addWidth} className="btn-ghost bg-white border border-surface-200 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700">
                <Plus size={14} /> Add Width
              </button>
            </div>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-header bg-surface-50">
            <div className="flex items-center gap-2">
              <Gauge size={16} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Roll Length Limit</h3>
            </div>
          </div>
          <div className="panel-body grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-8">
              <p className="text-sm font-semibold text-surface-700">Maximum fabric roll length</p>
              <p className="text-xs text-surface-400 mt-1">Pieces with final height above this limit are blocked before optimization.</p>
            </div>
            <div className="md:col-span-4 flex items-center gap-3">
              <input
                type="number"
                step="1"
                min="1"
                max="200"
                value={settings.max_roll_length}
                onChange={e => setSettings(s => ({ ...s, max_roll_length: parseFloat(e.target.value) || 30 }))}
                className="w-28 text-center font-mono font-bold"
              />
              <span className="text-sm font-medium text-surface-500">meters</span>
            </div>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-header bg-surface-50">
            <div className="flex items-center gap-2">
              <Recycle size={16} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Leftover Reuse Threshold</h3>
            </div>
          </div>
          <div className="panel-body grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-8">
              <p className="text-sm font-semibold text-surface-700">Minimum leftover width (% of job&apos;s roll width)</p>
              <p className="text-xs text-surface-400 mt-1">
                A leftover sheet must be at least this fraction of the active roll width to be reused.
                Lower = more leftover reuse (and more variety of widths attempted). Default 80%.
              </p>
            </div>
            <div className="md:col-span-4 flex items-center gap-3">
              <input
                type="number"
                step="5"
                min="10"
                max="100"
                value={Math.round(settings.leftover_reuse_threshold * 100)}
                onChange={e => {
                  const pct = parseFloat(e.target.value)
                  const clamped = Number.isFinite(pct) ? Math.max(10, Math.min(100, pct)) : 80
                  setSettings(s => ({ ...s, leftover_reuse_threshold: clamped / 100 }))
                }}
                className="w-28 text-center font-mono font-bold"
              />
              <span className="text-sm font-medium text-surface-500">%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-4 space-y-5">
        <div className="panel">
          <div className="panel-header bg-surface-50">
            <div className="flex items-center gap-2">
              <Settings size={16} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Summary</h3>
            </div>
          </div>
          <div className="panel-body space-y-4">
            <div className="stat-card">
              <p className="text-[11px] font-bold text-surface-400 uppercase tracking-wider">Configured Widths</p>
              <p className="text-2xl font-black text-surface-800 mt-1">{settings.roll_widths.length}</p>
            </div>
            <div className="stat-card">
              <p className="text-[11px] font-bold text-surface-400 uppercase tracking-wider">Max Roll Length</p>
              <p className="text-2xl font-black text-brand-600 mt-1">{settings.max_roll_length}m</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <button onClick={saveSettings} disabled={saving} className="btn-brand w-full py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={16} />
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
