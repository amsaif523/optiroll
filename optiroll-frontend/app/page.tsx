'use client'

import { useState } from 'react'
import { WorkOrderItem, OptimizeResponse } from '@/types'
import WorkOrderBuilder from '@/components/WorkOrderBuilder'
import RollConfig from '@/components/RollConfig'
import CutMapCanvas from '@/components/CutMapCanvas'
import {
  Scissors, Loader2, AlertCircle, FileText, BarChart3, CheckCircle2,
  Package, Recycle, Menu, X, ChevronRight, Home as HomeIcon, Settings,
  FolderOpen, History, HelpCircle, LogOut
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

const SIDEBAR_ITEMS = [
  { icon: <HomeIcon size={18} />, label: 'Dashboard', active: true },
  { icon: <FolderOpen size={18} />, label: 'Jobs' },
  { icon: <History size={18} />, label: 'History' },
  { icon: <Settings size={18} />, label: 'Settings' },
  { icon: <HelpCircle size={18} />, label: 'Help' },
]

export default function Home() {
  const [items, setItems] = useState<WorkOrderItem[]>([])
  const [rollWidth, setRollWidth] = useState(2.5)
  const [allowRotation, setAllowRotation] = useState(false)
  const [workOrderNumber, setWorkOrderNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OptimizeResponse | null>(null)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const runOptimization = async () => {
    if (items.length === 0) { setError('Add at least one piece'); return }
    if (!workOrderNumber.trim()) { setError('Enter Work Order Number'); return }
    setError('')
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/optimize/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_number: workOrderNumber,
          client_name: clientName,
          roll_width: rollWidth,
          allow_rotation: allowRotation,
          items,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Optimization failed')
      setResult(data.data)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* ─── LIGHT SIDEBAR ─── */}
      <aside className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-surface-200 shadow-sm transition-all duration-300 ${
        sidebarOpen ? 'w-56' : 'w-14'
      }`}>
        <div className="h-14 flex items-center px-3 border-b border-surface-100">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-8 h-8 rounded-lg bg-surface-100 hover:bg-surface-200 flex items-center justify-center transition-colors"
          >
            {sidebarOpen ? <X size={16} className="text-surface-600" /> : <Menu size={16} className="text-surface-600" />}
          </button>
          {sidebarOpen && (
            <span className="ml-3 text-sm font-bold text-surface-800">OptiRoll</span>
          )}
        </div>

        <nav className="py-3 space-y-1 px-2">
          {SIDEBAR_ITEMS.map((item, idx) => (
            <button
              key={idx}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                item.active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-surface-500 hover:bg-surface-100 hover:text-surface-800'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-surface-100">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-surface-500 hover:bg-surface-100 hover:text-surface-800 transition-colors rounded-lg">
            <span className="shrink-0"><LogOut size={18} /></span>
            {sidebarOpen && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarOpen ? 'ml-56' : 'ml-14'
      }`}>
        {/* Header */}
        <header className="bg-surface-0 border-b border-surface-200 sticky top-0 z-30 h-14 flex items-center px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-sm">
              <Scissors size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-surface-800 leading-tight">OptiRoll</h1>
              <p className="text-[10px] text-surface-400 font-medium uppercase tracking-wider leading-tight">Cutting Optimization</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {result && (
              <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} className="mr-1" /> Optimized
              </span>
            )}
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
              <span className="text-xs font-bold text-brand-700">JD</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 max-w-[1440px] mx-auto w-full px-6 py-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* LEFT COLUMN */}
            <div className="xl:col-span-4 space-y-4">
              <div className="panel">
                <div className="panel-header">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-brand-600" />
                    <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Job Identity</h3>
                  </div>
                </div>
                <div className="panel-body space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Work Order #</label>
                    <input value={workOrderNumber} onChange={e => setWorkOrderNumber(e.target.value)} placeholder="WO-2024-001" className="w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Client Name</label>
                    <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Acme Corporation" className="w-full" />
                  </div>
                </div>
              </div>

              <WorkOrderBuilder items={items} onChange={setItems} />
              <RollConfig rollWidth={rollWidth} allowRotation={allowRotation} onRollWidthChange={setRollWidth} onRotationChange={setAllowRotation} />

              <button
                onClick={runOptimization}
                disabled={loading || items.length === 0}
                className="btn-brand w-full py-3.5 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Scissors size={18} />}
                {loading ? 'Processing...' : 'Generate Cutting Map'}
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="xl:col-span-8">
              {result ? (
                <div className="space-y-4">
                  <div className="panel">
                    <div className="panel-header">
                      <div className="flex items-center gap-3">
                        <BarChart3 size={16} className="text-brand-600" />
                        <h2 className="text-sm font-bold text-surface-800">{result.work_order_number}</h2>
                        {result.client_name && <span className="text-sm text-surface-400">— {result.client_name}</span>}
                      </div>
                      <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={12} className="mr-1" /> Optimized
                      </span>
                    </div>
                    <div className="panel-body">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Stat icon={<Package size={14} />} value={result.total_sheets} label="Sheets" color="text-surface-800" />
                        <Stat icon={<Scissors size={14} />} value={result.total_pieces} label="Pieces" color="text-brand-600" />
                        <Stat icon={<BarChart3 size={14} />} value={`${result.utilization_percent}%`} label="Utilization" color="text-emerald-600" />
                        <Stat icon={<AlertCircle size={14} />} value={`${result.waste_percent}%`} label="Waste" color="text-red-500" />
                        <Stat icon={<Recycle size={14} />} value={result.total_leftovers_used} label="Leftovers Used" color="text-amber-600" />
                      </div>
                      {result.total_leftovers_used > 0 ? (
                        <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <Recycle size={14} className="text-amber-600" />
                          <span className="text-xs text-amber-700 font-medium">
                            {result.total_leftovers_used} leftover sheet(s) reused from previous jobs — saving material!
                          </span>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center gap-2 bg-surface-50 border border-surface-200 rounded-lg px-3 py-2">
                          <Package size={14} className="text-surface-400" />
                          <span className="text-xs text-surface-500">
                            No matching leftovers found. Used fresh roll width of {result.roll_width}m.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {result.sheets.map(sheet => (
                    <CutMapCanvas key={sheet.sheet_number} sheet={sheet} />
                  ))}
                </div>
              ) : (
                <div className="panel flex flex-col items-center justify-center py-32 text-surface-400 border-dashed border-2 border-surface-300">
                  <div className="w-16 h-16 bg-surface-100 rounded-2xl flex items-center justify-center mb-4">
                    <Scissors size={28} className="text-surface-300" />
                  </div>
                  <p className="text-base font-semibold text-surface-500">Cutting Map Preview</p>
                  <p className="text-sm text-surface-400 mt-1 max-w-sm text-center">
                    Enter production details and select roll width to generate optimized cutting layout.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-surface-0 border-t border-surface-200 py-3 px-6">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between text-xs text-surface-400">
            <div className="flex items-center gap-4">
              <span>© 2024 OptiRoll</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">v1.0.0</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                System Online
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">MySQL Connected</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Stat({ icon, value, label, color }: { icon: React.ReactNode; value: string | number; label: string; color: string }) {
  return (
    <div className="stat-card text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider mt-1 flex items-center justify-center gap-1">
        {icon} {label}
      </div>
    </div>
  )
}
 