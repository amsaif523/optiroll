'use client'

import { useState, useEffect } from 'react'
import { Settings, Plus, Trash2, Save, RotateCcw } from 'lucide-react'
import { getToken } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

interface AppSettings {
  roll_widths: number[]
  max_roll_length: number
}

interface Props {
  onSettingsChange?: (settings: AppSettings) => void
}

const DEFAULT_SETTINGS: AppSettings = {
  roll_widths: [2.0, 2.5, 2.8, 2.9, 3.0],
  max_roll_length: 30,
}

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
          const s: AppSettings = {
            roll_widths: Array.isArray(data.data.roll_widths) ? data.data.roll_widths : DEFAULT_SETTINGS.roll_widths,
            max_roll_length: typeof data.data.max_roll_length === 'number' ? data.data.max_roll_length : DEFAULT_SETTINGS.max_roll_length,
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
    const updated = [...settings.roll_widths, w].sort((a, b) => a - b)
    setSettings(s => ({ ...s, roll_widths: updated }))
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
    <div className="space-y-5">
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Roll Width Options</h3>
          </div>
          <button
            onClick={resetDefaults}
            className="btn-ghost flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-600"
          >
            <RotateCcw size={13} /> Reset defaults
          </button>
        </div>
        <div className="panel-body space-y-4">
          <p className="text-xs text-surface-400">
            These widths appear in Roll Configuration when building a work order.
          </p>

          {/* Current widths */}
          <div className="flex flex-wrap gap-2">
            {settings.roll_widths.map(w => (
              <div
                key={w}
                className="flex items-center gap-1.5 bg-brand-50 border border-brand-200 rounded-lg px-3 py-1.5"
              >
                <span className="text-sm font-bold text-brand-700">{w.toFixed(1)}m</span>
                <button
                  onClick={() => removeWidth(w)}
                  className="text-brand-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Add new width */}
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={newWidth}
              onChange={e => setNewWidth(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addWidth()}
              placeholder="e.g. 3.2"
              className="w-32 text-center"
            />
            <span className="flex items-center text-sm text-surface-500 font-medium">m</span>
            <button
              onClick={addWidth}
              className="btn-ghost flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              <Plus size={14} /> Add Width
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Roll Length Limit</h3>
          </div>
        </div>
        <div className="panel-body space-y-3">
          <p className="text-xs text-surface-400">
            Maximum length of a fabric roll. Used as the roll height limit during optimization.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="1"
              min="1"
              max="200"
              value={settings.max_roll_length}
              onChange={e => setSettings(s => ({ ...s, max_roll_length: parseFloat(e.target.value) || 30 }))}
              className="w-28 text-center"
            />
            <span className="text-sm font-medium text-surface-500">meters</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <button
        onClick={saveSettings}
        disabled={saving}
        className="btn-brand w-full py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Save size={16} />
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  )
}
