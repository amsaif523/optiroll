'use client'

import { RotateCcw, TrendingUp } from 'lucide-react'

interface RollWidthSuggestion {
  width: number
  utilization: number
  sheets: number
  all_fit: boolean
}

interface Props {
  rollWidth: number
  allowRotation: boolean
  availableWidths: number[]
  suggestions?: RollWidthSuggestion[]
  onRollWidthChange: (w: number) => void
  onRotationChange: (v: boolean) => void
}

export default function RollConfig({
  rollWidth, allowRotation, availableWidths, suggestions,
  onRollWidthChange, onRotationChange
}: Props) {
  const widths = availableWidths.length > 0 ? availableWidths : [2.0, 2.5, 2.8, 2.9, 3.0]
  const best = suggestions && suggestions.length > 0 ? suggestions[0] : null

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <RotateCcw size={16} className="text-brand-600" />
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Roll Configuration</h3>
        </div>
      </div>
      <div className="panel-body space-y-4">
        {/* Best-width suggestion badge */}
        {best && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <TrendingUp size={14} className="text-emerald-600 shrink-0" />
            <span className="text-xs text-emerald-700 font-medium">
              Suggested: <strong>{best.width.toFixed(1)}m</strong> roll — {best.utilization}% utilization
              {suggestions && suggestions.length > 1 && (
                <span className="text-emerald-500 font-normal">
                  {' '}(vs {suggestions[1].width.toFixed(1)}m at {suggestions[1].utilization}%)
                </span>
              )}
            </span>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-2">Select Roll Width</label>
          <div className="flex flex-wrap gap-2">
            {widths.map(w => {
              const sug = suggestions?.find(s => s.width === w)
              const isBest = best && best.width === w
              return (
                <button
                  key={w}
                  onClick={() => onRollWidthChange(w)}
                  className={`relative py-2.5 px-3 rounded-lg text-sm font-bold transition-all ${
                    rollWidth === w
                      ? 'bg-brand-600 text-white shadow-md ring-2 ring-brand-500/30'
                      : isBest
                        ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-400 hover:bg-emerald-100'
                        : 'bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700'
                  }`}
                >
                  {w.toFixed(1)}m
                  {isBest && rollWidth !== w && (
                    <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" title="Best utilization" />
                  )}
                  {sug && (
                    <div className="text-[9px] font-normal mt-0.5 opacity-70">
                      {sug.utilization}%
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between bg-surface-50 rounded-lg px-4 py-3 border border-surface-200">
          <div className="flex items-center gap-2">
            <RotateCcw size={15} className="text-surface-500" />
            <span className="text-sm font-semibold text-surface-700">Allow 90° Rotation</span>
          </div>
          <button
            onClick={() => onRotationChange(!allowRotation)}
            className={`relative w-11 h-6 rounded-full transition-colors ${allowRotation ? 'bg-brand-600' : 'bg-surface-300'}`}
          >
            <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${allowRotation ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  )
}
