'use client'

import { Settings, RotateCcw } from 'lucide-react'

const WIDTHS = [2.0, 2.5, 2.8, 2.9, 3.0]

interface Props {
  rollWidth: number
  allowRotation: boolean
  onRollWidthChange: (w: number) => void
  onRotationChange: (v: boolean) => void
}

export default function RollConfig({ rollWidth, allowRotation, onRollWidthChange, onRotationChange }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-brand-600" />
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Roll Configuration</h3>
        </div>
      </div>
      <div className="panel-body space-y-4">
        <div>
          <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-2">Select Roll Width</label>
          <div className="grid grid-cols-5 gap-2">
            {WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => onRollWidthChange(w)}
                className={`py-3 rounded-lg text-sm font-bold transition-all ${
                  rollWidth === w
                    ? 'bg-brand-600 text-white shadow-md ring-2 ring-brand-500/30'
                    : 'bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700'
                }`}
              >
                {w.toFixed(1)}m
              </button>
            ))}
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
