'use client'

import { useState, useEffect } from 'react'
import { WorkOrderItem, OptimizeResponse, AppSettings } from '@/types'
import WorkOrderBuilder from '@/components/WorkOrderBuilder'
import CutMapCanvas from '@/components/CutMapCanvas'
import SettingsPanel from '@/components/SettingsPanel'
import { getToken, getUser, clearToken, getInitials, AuthUser } from '@/lib/auth'
import {
  Scissors, Loader2, AlertCircle, FileText, BarChart3, CheckCircle2,
  Package, Recycle, Menu, X, Home as HomeIcon, Settings,
  FolderOpen, History, HelpCircle, LogOut, List, Eye, TrendingUp, RotateCcw
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

type ActiveTab = 'dashboard' | 'settings'

// 5-decimal precision for dimension values
const fmtDim = (v: number) => v.toFixed(5)

export default function Home() {
  const [items, setItems] = useState<WorkOrderItem[]>([])
  const [allowRotation, setAllowRotation] = useState(false)
  const [workOrderNumber, setWorkOrderNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OptimizeResponse | null>(null)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showPiecesModal, setShowPiecesModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showRotationModal, setShowRotationModal] = useState(false)
  const [rotatedPieces, setRotatedPieces] = useState<{ shade_number: string; sheet: number; widthIn: number; heightIn: number }[]>([])
  const [user, setUser] = useState<AuthUser | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')
  const [appSettings, setAppSettings] = useState<AppSettings>({
    roll_widths: [2.0, 2.5, 2.8, 2.9, 3.0],
    max_roll_length: 30,
  })

  useEffect(() => {
    setUser(getUser())
  }, [])

  const handleLogout = () => {
    clearToken()
    window.location.href = '/login'
  }

  const runOptimization = async () => {
    if (items.length === 0) { setError('Add at least one piece'); return }
    if (!workOrderNumber.trim()) { setError('Enter Work Order Number'); return }

    const missingWidths = items.find(i => i.selected_widths.length === 0)
    if (missingWidths) {
      setError(`Piece "${missingWidths.shade_number}" has no roll width selected.`)
      return
    }

    const getFinalH = (i: WorkOrderItem) => i.blind_type === 'zebra' ? i.height * 2 + i.valence : i.height + i.valence
    const tooTall = items.find(i => getFinalH(i) > appSettings.max_roll_length)
    if (tooTall) {
      setError(`Blind "${tooTall.shade_number}" final height ${fmtDim(getFinalH(tooTall))}m exceeds max roll length ${appSettings.max_roll_length}m.`)
      return
    }

    setError('')
    setLoading(true)
    setResult(null)
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE}/optimize/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          work_order_number: workOrderNumber,
          client_name: clientName,
          roll_width: 0,
          allow_rotation: allowRotation,
          max_roll_length: appSettings.max_roll_length,
          items,
        }),
      })
      if (res.status === 401) { handleLogout(); return }
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Optimization failed')
      setResult(data.data)
      // If rotation was enabled, show which pieces got rotated
      if (allowRotation) {
        const M_TO_IN = 1 / 0.0254
        const rotated = (data.data.sheets as import('@/types').Sheet[]).flatMap(s =>
          s.blinds
            .filter(b => b.rotated)
            .map(b => ({
              shade_number: b.shade_number,
              sheet: s.sheet_number,
              widthIn:  parseFloat((b.width  * M_TO_IN).toFixed(5)),
              heightIn: parseFloat((b.height * M_TO_IN).toFixed(5)),
            }))
        )
        if (rotated.length > 0) {
          setRotatedPieces(rotated)
          setShowRotationModal(true)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Optimization failed')
    }
    setLoading(false)
  }

  const initials = user?.full_name ? getInitials(user.full_name) : user?.username?.slice(0, 2).toUpperCase() ?? 'OP'

  // Best suggestion (excluding the one already used)
  const usedSuggestion = result?.roll_width_suggestions?.find(s => s.width === result.roll_width)
  const alternateSuggestion = result?.roll_width_suggestions?.find(s => s.width !== result.roll_width)

  const SIDEBAR_ITEMS = [
    { icon: <HomeIcon size={18} />, label: 'Dashboard', tab: 'dashboard' as ActiveTab },
    { icon: <FolderOpen size={18} />, label: 'Jobs' },
    { icon: <History size={18} />, label: 'History' },
    { icon: <Settings size={18} />, label: 'Settings', tab: 'settings' as ActiveTab },
    { icon: <HelpCircle size={18} />, label: 'Help' },
  ]

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-surface-200 shadow-sm transition-all duration-300 flex flex-col ${
        sidebarOpen ? 'w-56' : 'w-14'
      }`}>
        <div className="h-14 flex items-center px-3 border-b border-surface-100 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-8 h-8 rounded-lg bg-surface-100 hover:bg-surface-200 flex items-center justify-center transition-colors"
          >
            {sidebarOpen ? <X size={16} className="text-surface-600" /> : <Menu size={16} className="text-surface-600" />}
          </button>
          {sidebarOpen && (
            <div className="ml-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-brand-600 rounded flex items-center justify-center">
                <Scissors size={13} className="text-white" />
              </div>
              <span className="text-sm font-bold text-surface-800">OptiRoll</span>
            </div>
          )}
        </div>

        <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item, idx) => (
            <button
              key={idx}
              onClick={() => item.tab && setActiveTab(item.tab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                item.tab && activeTab === item.tab
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-surface-500 hover:bg-surface-100 hover:text-surface-800'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-surface-100 space-y-1 shrink-0">
          {sidebarOpen && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-50 mb-1">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-brand-700">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-surface-800 truncate">{user?.full_name || user?.username}</p>
                <p className="text-[10px] text-surface-400 capitalize">{user?.role || 'operator'}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-surface-500 hover:bg-red-50 hover:text-red-600 transition-colors rounded-lg"
          >
            <span className="shrink-0"><LogOut size={18} /></span>
            {sidebarOpen && <span className="text-sm font-medium">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? 'ml-56' : 'ml-14'}`}>

        {/* HEADER */}
        <header className="bg-white border-b border-surface-200 sticky top-0 z-30 h-14 flex items-center px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-sm">
              <Scissors size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-surface-800 leading-tight">OptiRoll</h1>
              <p className="text-[10px] text-surface-400 font-medium uppercase tracking-wider leading-tight">Cutting Optimization</p>
            </div>
            {activeTab === 'settings' && (
              <span className="ml-2 badge bg-brand-50 text-brand-700 border border-brand-200">Settings</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {result && (
              <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} className="mr-1" /> Optimized
              </span>
            )}
            {items.length > 0 && !result && (
              <span className="badge bg-blue-50 text-blue-700 border border-blue-200">
                <List size={12} className="mr-1" /> {items.length} piece{items.length !== 1 ? 's' : ''} queued
              </span>
            )}
            <div className="h-6 w-px bg-surface-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                <span className="text-xs font-bold text-brand-700">{initials}</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-surface-700 leading-tight">{user?.full_name || user?.username}</p>
                <p className="text-[10px] text-surface-400 capitalize leading-tight">{user?.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 max-w-[1440px] mx-auto w-full px-6 py-6">
          {activeTab === 'settings' ? (
            <div className="max-w-2xl mx-auto">
              <div className="mb-5">
                <h2 className="text-lg font-bold text-surface-800">Settings</h2>
                <p className="text-sm text-surface-400 mt-1">Configure roll widths and optimization parameters.</p>
              </div>
              <SettingsPanel onSettingsChange={setAppSettings} />
            </div>
          ) : (
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

                <WorkOrderBuilder
                  items={items}
                  onChange={setItems}
                  availableWidths={appSettings.roll_widths}
                  allowRotation={allowRotation}
                  onAllowRotationChange={setAllowRotation}
                />

                {/* Max roll length hint */}
                <div className="flex items-center justify-between text-xs text-surface-400 px-1">
                  <span>Max roll length: <strong className="text-surface-600">{appSettings.max_roll_length}m</strong></span>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="text-brand-500 hover:text-brand-700 font-medium underline underline-offset-2"
                  >
                    Change in Settings
                  </button>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="xl:col-span-8 space-y-3">
                {/* Generate button + error — always at top of right column */}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      if (items.length === 0) { setError('Add at least one piece'); return }
                      if (!workOrderNumber.trim()) { setError('Enter Work Order Number'); return }
                      const missingWidths = items.find(i => i.selected_widths.length === 0)
                      if (missingWidths) { setError(`Piece "${missingWidths.shade_number}" has no roll width selected.`); return }
                      setError('')
                      setShowConfirmModal(true)
                    }}
                    disabled={loading || items.length === 0}
                    className="btn-brand w-full py-3.5 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Scissors size={18} />}
                    {loading ? 'Processing…' : 'Generate Cutting Map'}
                  </button>
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}
                </div>

                {result ? (
                  <div className="space-y-4">
                    <div className="panel">
                      <div className="panel-header">
                        <div className="flex items-center gap-3">
                          <BarChart3 size={16} className="text-brand-600" />
                          <h2 className="text-sm font-bold text-surface-800">{result.work_order_number}</h2>
                          {result.client_name && <span className="text-sm text-surface-400">— {result.client_name}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowPiecesModal(true)}
                            className="btn-ghost flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5"
                          >
                            <Eye size={13} /> Piece Details
                          </button>
                          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} className="mr-1" /> Optimized
                          </span>
                        </div>
                      </div>
                      <div className="panel-body">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <Stat icon={<Package size={14} />} value={result.total_sheets} label="Sheets" color="text-surface-800" />
                          <Stat icon={<Scissors size={14} />} value={result.total_pieces} label="Pieces" color="text-brand-600" />
                          <Stat icon={<BarChart3 size={14} />} value={`${result.utilization_percent}%`} label="Utilization" color="text-emerald-600" />
                          <Stat icon={<AlertCircle size={14} />} value={`${result.waste_percent}%`} label="Waste" color="text-red-500" />
                          <Stat icon={<Recycle size={14} />} value={result.total_leftovers_used} label="Leftovers Used" color="text-amber-600" />
                        </div>

                        {/* Which roll was chosen and why */}
                        <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                          <TrendingUp size={14} className="text-emerald-600 shrink-0" />
                          <span className="text-xs text-emerald-700 font-medium">
                            Auto-selected: <strong>{result.roll_width}m</strong> roll
                            {usedSuggestion && ` — ${usedSuggestion.utilization}% utilization, ${usedSuggestion.sheets} sheet(s)`}
                            {alternateSuggestion && (
                              <span className="text-emerald-500 font-normal">
                                {' '}(next best: {alternateSuggestion.width}m at {alternateSuggestion.utilization}%)
                              </span>
                            )}
                          </span>
                        </div>

                        {result.total_leftovers_used > 0 ? (
                          <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <Recycle size={14} className="text-amber-600" />
                            <span className="text-xs text-amber-700 font-medium">
                              {result.total_leftovers_used} leftover sheet(s) reused — saving material!
                            </span>
                          </div>
                        ) : (
                          <div className="mt-2 flex items-center gap-2 bg-surface-50 border border-surface-200 rounded-lg px-3 py-2">
                            <Package size={14} className="text-surface-400" />
                            <span className="text-xs text-surface-500">
                              No matching leftovers found. Used fresh {result.roll_width}m roll.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {result.sheets.map(sheet => (
                      <CutMapCanvas key={sheet.sheet_number} sheet={sheet} />
                    ))}
                  </div>

                ) : items.length > 0 ? (
                  <PiecePreview
                    items={items}
                    onRemove={id => setItems(prev => prev.filter(i => i.id !== id))}
                    maxRollLength={appSettings.max_roll_length}
                  />
                ) : (
                  <div className="panel flex flex-col items-center justify-center py-32 text-surface-400 border-dashed border-2 border-surface-300">
                    <div className="w-16 h-16 bg-surface-100 rounded-2xl flex items-center justify-center mb-4">
                      <Scissors size={28} className="text-surface-300" />
                    </div>
                    <p className="text-base font-semibold text-surface-500">Cutting Map Preview</p>
                    <p className="text-sm text-surface-400 mt-1 max-w-sm text-center">
                      Enter production details and add pieces to see a live preview here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* FOOTER */}
        <footer className="bg-white border-t border-surface-200 py-3 px-6">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between text-xs text-surface-400">
            <div className="flex items-center gap-4">
              <span className="font-medium text-surface-500">© 2024 OptiRoll</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">v1.1.0</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">Blinds Manufacturing Optimization</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                System Online
              </span>
              {user && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline capitalize">{user.role}: {user.username}</span>
                </>
              )}
            </div>
          </div>
        </footer>
      </div>

      {/* PIECE DETAILS MODAL */}
      {showPiecesModal && result && (
        <PiecesModal items={items} result={result} onClose={() => setShowPiecesModal(false)} />
      )}

      {/* CONFIRM GENERATION MODAL */}
      {showConfirmModal && (
        <ConfirmGenerateModal
          items={items}
          workOrderNumber={workOrderNumber}
          clientName={clientName}
          allowRotation={allowRotation}
          maxRollLength={appSettings.max_roll_length}
          onConfirm={() => { setShowConfirmModal(false); runOptimization() }}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}

      {/* ROTATION INFO MODAL */}
      {showRotationModal && rotatedPieces.length > 0 && (
        <RotationInfoModal
          pieces={rotatedPieces}
          onClose={() => setShowRotationModal(false)}
        />
      )}
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

function PiecePreview({ items, onRemove, maxRollLength }: {
  items: WorkOrderItem[]
  onRemove: (id: string) => void
  maxRollLength: number
}) {
  const M_TO_IN = 1 / 0.0254
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const getFinalH = (i: WorkOrderItem) => i.blind_type === 'zebra' ? i.height * 2 + i.valence : i.height + i.valence
  const hasHeightIssue = items.some(i => getFinalH(i) > maxRollLength)
  const hasWidthIssue  = items.some(i => {
    const maxW = i.selected_widths.length > 0 ? Math.max(...i.selected_widths) : 0
    return maxW > 0 && i.width > maxW
  })

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <List size={15} className="text-brand-600" />
          <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Pieces Added</h3>
          <span className="badge bg-brand-50 text-brand-700 border border-brand-200 ml-1">
            {items.length} item{items.length !== 1 ? 's' : ''} · {totalQty} pcs total
          </span>
        </div>
      </div>

      {hasWidthIssue && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">
            <strong>Piece(s) too wide</strong> — one or more blinds exceed their selected roll widths.
          </p>
        </div>
      )}
      {hasHeightIssue && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700"><strong>Height issue:</strong> one or more blinds exceed {maxRollLength}m roll length.</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-50 border-b border-surface-200">
              <th className="text-left px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">Shade</th>
              <th className="text-left px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">Type</th>
              <th className="text-right px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">W (&quot;)</th>
              <th className="text-right px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">Final H (&quot;)</th>
              <th className="text-right px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">Qty</th>
              <th className="text-left px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">Roll Widths</th>
              <th className="text-left px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">Material</th>
              <th className="text-left px-4 py-2.5 font-bold text-surface-400 uppercase tracking-wider">Color</th>
              <th className="px-2 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {items.map((item, idx) => {
              const wIn      = item.width  * M_TO_IN
              const finalHIn = getFinalH(item) * M_TO_IN
              const maxW     = item.selected_widths.length > 0 ? Math.max(...item.selected_widths) : 0
              const widthBad  = maxW > 0 && item.width > maxW
              const heightBad = getFinalH(item) > maxRollLength
              return (
                <tr key={item.id} className={`transition-colors ${heightBad || widthBad ? 'bg-red-50' : 'hover:bg-surface-50'}`}>
                  <td className="px-4 py-3 text-surface-400">{idx + 1}</td>
                  <td className="px-4 py-3 font-semibold text-surface-800">{item.shade_number || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold uppercase ${
                      item.blind_type === 'roller' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                    }`}>{item.blind_type}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${widthBad ? 'text-red-600 font-bold' : 'text-surface-700'}`}>
                    {fmtDim(wIn)}&quot;{widthBad && ' ⚠'}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${heightBad ? 'text-red-600' : 'text-brand-700'}`}>
                    {fmtDim(finalHIn)}&quot;{heightBad && ' ⚠'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-surface-800">{item.quantity}</td>
                  <td className="px-4 py-3">
                    {item.selected_widths.length === 0
                      ? <span className="text-red-500 font-bold">⚠ None</span>
                      : <span className="text-surface-600">{item.selected_widths.map(w => `${w.toFixed(1)}m`).join(', ')}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-surface-600">{item.material_type}</td>
                  <td className="px-4 py-3 text-surface-600">{item.color}</td>
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => onRemove(item.id)}
                      className="text-surface-400 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded"
                      title="Remove piece"
                    >
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-body border-t border-surface-100 bg-surface-50">
        <div className="flex items-center gap-6 text-xs text-surface-500 flex-wrap">
          <span>Max length: <strong className="text-surface-700">{maxRollLength}m ({(maxRollLength / 0.0254).toFixed(0)}&quot;)</strong></span>
          <span>Total qty: <strong className="text-surface-700">{totalQty}</strong></span>
        </div>
      </div>
    </div>
  )
}

function PiecesModal({ items, result, onClose }: { items: WorkOrderItem[]; result: OptimizeResponse; onClose: () => void }) {
  const totalQty    = items.reduce((s, i) => s + i.quantity, 0)
  const rollerCount = items.filter(i => i.blind_type === 'roller').reduce((s, i) => s + i.quantity, 0)
  const zebraCount  = items.filter(i => i.blind_type === 'zebra').reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex-1 flex flex-col bg-white w-full h-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center gap-4 shrink-0 shadow-sm">
          <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center">
            <List size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-surface-800">Piece Details</h2>
            <p className="text-xs text-surface-400">
              {result.work_order_number}{result.client_name ? ` — ${result.client_name}` : ''}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="badge bg-surface-100 text-surface-700 border border-surface-200"><Package size={11} className="mr-1" />{items.length} items</span>
              <span className="badge bg-brand-50 text-brand-700 border border-brand-200"><Scissors size={11} className="mr-1" />{totalQty} pcs</span>
              {rollerCount > 0 && <span className="badge bg-blue-50 text-blue-700 border border-blue-200">Roller: {rollerCount}</span>}
              {zebraCount  > 0 && <span className="badge bg-purple-50 text-purple-700 border border-purple-200">Zebra: {zebraCount}</span>}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-surface-100 hover:bg-surface-200 flex items-center justify-center">
              <X size={16} className="text-surface-600" />
            </button>
          </div>
        </div>

        <div className="bg-surface-50 border-b border-surface-200 px-6 py-3 shrink-0">
          <div className="flex items-center gap-6 flex-wrap text-xs">
            <span className="text-surface-400 font-bold uppercase">Roll Used</span>
            <span className="font-bold text-brand-600">{result.roll_width}m</span>
            <span className="text-surface-400 font-bold uppercase">Utilization</span>
            <span className="font-bold text-emerald-600">{result.utilization_percent}%</span>
            <span className="text-surface-400 font-bold uppercase">Waste</span>
            <span className="font-bold text-red-500">{result.waste_percent}%</span>
            <span className="text-surface-400 font-bold uppercase">Sheets</span>
            <span className="font-bold text-surface-700">{result.total_sheets}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-50 shadow-sm">
                {['#','Shade #','Type','Width (m)','Height (m)','Valence (in)','Final H (m)','Qty','Material','Color','Pattern','Roll Widths'].map(h => (
                  <th key={h} className="px-4 py-3 font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const finalH = item.blind_type === 'roller' ? item.height + item.valence : item.height * 2 + item.valence
                const valIn  = item.valence / 0.0254
                return (
                  <tr key={item.id} className={`border-b border-surface-100 hover:bg-brand-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-surface-50/50'}`}>
                    <td className="px-4 py-3 text-surface-400 font-mono">{String(idx + 1).padStart(2, '0')}</td>
                    <td className="px-4 py-3 font-bold text-surface-800">{item.shade_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold uppercase ${
                        item.blind_type === 'roller' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>{item.blind_type}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-surface-700">{fmtDim(item.width)}</td>
                    <td className="px-4 py-3 text-right font-mono text-surface-700">{fmtDim(item.height)}</td>
                    <td className="px-4 py-3 text-right font-mono text-surface-500">{valIn > 0 ? `${fmtDim(valIn)}"` : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-brand-700">{fmtDim(finalH)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 text-brand-800 font-bold">{item.quantity}</span>
                    </td>
                    <td className="px-4 py-3 text-surface-600">{item.material_type}</td>
                    <td className="px-4 py-3 text-surface-600">{item.color}</td>
                    <td className="px-4 py-3 text-surface-500">{item.pattern || '—'}</td>
                    <td className="px-4 py-3">
                      {item.selected_widths && item.selected_widths.length > 0
                        ? <div className="flex flex-wrap gap-1">
                            {item.selected_widths.map(w => (
                              <span key={w} className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] font-bold border border-brand-200">{w.toFixed(1)}m</span>
                            ))}
                          </div>
                        : <span className="text-red-500 font-bold text-[10px]">⚠ None</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white border-t border-surface-200 px-6 py-4 flex items-center justify-between shrink-0">
          <p className="text-xs text-surface-400">{items.length} line(s) · {totalQty} total units</p>
          <button onClick={onClose} className="btn-brand px-6 py-2.5 text-sm font-semibold">Close</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmGenerateModal({
  items, workOrderNumber, clientName, allowRotation, maxRollLength, onConfirm, onCancel
}: {
  items: WorkOrderItem[]
  workOrderNumber: string
  clientName: string
  allowRotation: boolean
  maxRollLength: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const M_TO_IN = 1 / 0.0254
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const getFinalH = (i: WorkOrderItem) => i.blind_type === 'zebra' ? i.height * 2 + i.valence : i.height + i.valence

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-brand-600 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Scissors size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Confirm Optimization</h2>
            <p className="text-xs text-brand-200 mt-0.5">Review before generating the cutting map</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Job info */}
          <div className="bg-surface-50 rounded-xl px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-surface-400 font-medium">Work Order</span>
              <span className="font-bold text-surface-800">{workOrderNumber || '—'}</span>
            </div>
            {clientName && (
              <div className="flex justify-between">
                <span className="text-surface-400 font-medium">Client</span>
                <span className="font-semibold text-surface-700">{clientName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-surface-400 font-medium">Max roll length</span>
              <span className="font-semibold text-surface-700">{maxRollLength}m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400 font-medium">90° Rotation</span>
              <span className={`font-bold ${allowRotation ? 'text-emerald-600' : 'text-surface-500'}`}>
                {allowRotation ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Pieces summary */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-surface-500 uppercase tracking-wider">Pieces to Cut</span>
              <span className="badge bg-brand-50 text-brand-700 border border-brand-200">
                {items.length} line{items.length !== 1 ? 's' : ''} · {totalQty} pcs total
              </span>
            </div>
            <div className="border border-surface-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-surface-400 uppercase">Shade</th>
                    <th className="px-3 py-2 text-left font-bold text-surface-400 uppercase">Type</th>
                    <th className="px-3 py-2 text-right font-bold text-surface-400 uppercase">W (&quot;)</th>
                    <th className="px-3 py-2 text-right font-bold text-surface-400 uppercase">Final H (&quot;)</th>
                    <th className="px-3 py-2 text-center font-bold text-surface-400 uppercase">Qty</th>
                    <th className="px-3 py-2 text-left font-bold text-surface-400 uppercase">Rolls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {items.map((item, idx) => (
                    <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-surface-50/50'}>
                      <td className="px-3 py-2 font-semibold text-surface-800">{item.shade_number || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                          item.blind_type === 'zebra' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                        }`}>{item.blind_type === 'zebra' ? 'Z' : 'R'}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-surface-700">{(item.width * M_TO_IN).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-brand-700">{(getFinalH(item) * M_TO_IN).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center font-bold text-surface-800">{item.quantity}</td>
                      <td className="px-3 py-2 text-surface-600 text-[10px]">{item.selected_widths.map(w => `${w.toFixed(1)}m`).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-sm text-surface-600 text-center font-medium">
            Are you sure you want to generate the cutting map with these <strong>{totalQty} pieces</strong>?
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border-2 border-surface-200 text-surface-600 font-bold text-sm hover:bg-surface-50 transition-colors"
          >
            No, Go Back
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
          >
            <Scissors size={16} /> Yes, Generate!
          </button>
        </div>
      </div>
    </div>
  )
}

function RotationInfoModal({
  pieces, onClose
}: {
  pieces: { shade_number: string; sheet: number; widthIn: number; heightIn: number }[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-emerald-600 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <RotateCcw size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">90° Rotation Applied</h2>
            <p className="text-xs text-emerald-200 mt-0.5">
              {pieces.length} piece{pieces.length !== 1 ? 's were' : ' was'} rotated to achieve better fit
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-surface-600">
            The optimizer rotated the following pieces <strong>90°</strong> to minimize waste and improve roll utilization:
          </p>

          <div className="border border-emerald-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-emerald-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 text-left font-bold text-emerald-700 uppercase">Shade #</th>
                  <th className="px-3 py-2.5 text-center font-bold text-emerald-700 uppercase">Sheet</th>
                  <th className="px-3 py-2.5 text-right font-bold text-emerald-700 uppercase">W on Roll (&quot;)</th>
                  <th className="px-3 py-2.5 text-right font-bold text-emerald-700 uppercase">H on Roll (&quot;)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100">
                {pieces.map((p, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-emerald-50/40'}>
                    <td className="px-3 py-2 font-bold text-surface-800">{p.shade_number}</td>
                    <td className="px-3 py-2 text-center text-surface-600">#{p.sheet}</td>
                    <td className="px-3 py-2 text-right font-mono text-surface-700">{p.widthIn.toFixed(5)}&quot;</td>
                    <td className="px-3 py-2 text-right font-mono text-surface-700">{p.heightIn.toFixed(5)}&quot;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Rotated pieces are placed <strong>sideways</strong> on the roll. The dimensions shown above are as physically cut — Width is along the roll width axis, Height is along the roll length axis.
            </p>
          </div>
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
