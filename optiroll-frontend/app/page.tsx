'use client'

import { useState, useEffect } from 'react'
import { WorkOrderItem, OptimizeResponse } from '@/types'
import WorkOrderBuilder from '@/components/WorkOrderBuilder'
import RollConfig from '@/components/RollConfig'
import CutMapCanvas from '@/components/CutMapCanvas'
import { getToken, getUser, clearToken, getInitials, AuthUser } from '@/lib/auth'
import {
  Scissors, Loader2, AlertCircle, FileText, BarChart3, CheckCircle2,
  Package, Recycle, Menu, X, Home as HomeIcon, Settings,
  FolderOpen, History, HelpCircle, LogOut, List, Eye
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
  const [showPiecesModal, setShowPiecesModal] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

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

    const oversized = items.filter(i => i.width > rollWidth)
    if (oversized.length > 0) {
      const worst = oversized.reduce((a, b) => a.width > b.width ? a : b)
      setError(
        `${oversized.length} blind(s) are wider than the ${rollWidth}m roll. ` +
        `Widest: "${worst.shade_number}" at ${worst.width.toFixed(3)}m. ` +
        `Check your unit (m/cm/in), enable 90° rotation, or select a wider roll.`
      )
      return
    }

    const MAX_ROLL_LENGTH = 30
    const getFinalH = (i: WorkOrderItem) => i.blind_type === 'zebra' ? i.height * 2 + i.valence : i.height + i.valence
    const tooTall = items.find(i => getFinalH(i) > MAX_ROLL_LENGTH)
    if (tooTall) {
      setError(
        `Blind "${tooTall.shade_number}" has a final height of ${getFinalH(tooTall).toFixed(3)}m — ` +
        `exceeds the ${MAX_ROLL_LENGTH}m roll length. Are you entering dimensions in the right unit? ` +
        `(e.g. 40 cm should use the "cm" toggle, not "m")`
      )
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
        body: JSON.stringify({ work_order_number: workOrderNumber, client_name: clientName, roll_width: rollWidth, allow_rotation: allowRotation, items }),
      })
      if (res.status === 401) { handleLogout(); return }
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Optimization failed')
      setResult(data.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Optimization failed')
    }
    setLoading(false)
  }

  const initials = user?.full_name ? getInitials(user.full_name) : user?.username?.slice(0, 2).toUpperCase() ?? 'OP'

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* ─── SIDEBAR ─── */}
      <aside className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-surface-200 shadow-sm transition-all duration-300 flex flex-col ${
        sidebarOpen ? 'w-56' : 'w-14'
      }`}>
        {/* Sidebar header */}
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

        {/* Nav links */}
        <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
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

        {/* User profile + logout */}
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

      {/* ─── MAIN CONTENT ─── */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? 'ml-56' : 'ml-14'}`}>

        {/* ─── HEADER ─── */}
        <header className="bg-white border-b border-surface-200 sticky top-0 z-30 h-14 flex items-center px-6 shadow-sm">
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

        {/* ─── PAGE CONTENT ─── */}
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

              <WorkOrderBuilder items={items} onChange={setItems} rollWidth={rollWidth} />
              <RollConfig rollWidth={rollWidth} allowRotation={allowRotation} onRollWidthChange={setRollWidth} onRotationChange={setAllowRotation} />

              <button
                onClick={runOptimization}
                disabled={loading || items.length === 0}
                className="btn-brand w-full py-3.5 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed">
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

            {/* RIGHT COLUMN */}
            <div className="xl:col-span-8">
              {result ? (
                /* ── RESULT VIEW ── */
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
                          <Eye size={13} /> View Piece Details
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
                      {result.total_leftovers_used > 0 ? (
                        <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <Recycle size={14} className="text-amber-600" />
                          <span className="text-xs text-amber-700 font-medium">
                            {result.total_leftovers_used} leftover sheet(s) reused — saving material!
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

              ) : items.length > 0 ? (
                /* ── PIECE PREVIEW (items added but not yet optimized) ── */
                <PiecePreview items={items} rollWidth={rollWidth} />

              ) : (
                /* ── EMPTY PLACEHOLDER ── */
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
        </main>

        {/* ─── FOOTER ─── */}
        <footer className="bg-white border-t border-surface-200 py-3 px-6">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between text-xs text-surface-400">
            <div className="flex items-center gap-4">
              <span className="font-medium text-surface-500">© 2024 OptiRoll</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">v1.0.0</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">Blinds Manufacturing Optimization</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                System Online
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">MySQL Connected</span>
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

      {/* ─── PIECE DETAILS MODAL ─── */}
      {showPiecesModal && result && (
        <PiecesModal items={items} result={result} onClose={() => setShowPiecesModal(false)} />
      )}
    </div>
  )
}

/* ── Stat card ── */
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

const MAX_ROLL_LENGTH = 30

/* ── Piece Preview Panel (shown when items added but not yet optimized) ── */
function PiecePreview({ items, rollWidth }: { items: WorkOrderItem[]; rollWidth: number }) {
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const getFinalH = (i: WorkOrderItem) => i.blind_type === 'zebra' ? i.height * 2 + i.valence : i.height + i.valence

  const hasWidthIssue = items.some(i => i.width > rollWidth)
  const hasHeightIssue = items.some(i => getFinalH(i) > MAX_ROLL_LENGTH)

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
        <span className="text-xs text-surface-400">Click "Generate Cutting Map" when ready</span>
      </div>

      {(hasWidthIssue || hasHeightIssue) && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-xs text-red-700 space-y-1">
            {hasWidthIssue && <p><strong>Width issue:</strong> one or more blinds are wider than the {rollWidth}m roll.</p>}
            {hasHeightIssue && <p><strong>Height issue:</strong> one or more blinds have a final height &gt; {MAX_ROLL_LENGTH}m roll length. Check your unit — e.g. use the "cm" toggle if dimensions are in centimetres.</p>}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-50 border-b border-surface-200">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Shade</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Type</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Width (m)</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Height (m)</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Val (m)</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Final H (m)</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Qty</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Material</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Color</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {items.map((item, idx) => {
              const finalH = getFinalH(item)
              const widthBad = item.width > rollWidth
              const heightBad = finalH > MAX_ROLL_LENGTH
              const rowBad = widthBad || heightBad
              return (
                <tr key={item.id} className={`transition-colors ${rowBad ? 'bg-red-50' : 'hover:bg-surface-50'}`}>
                  <td className="px-4 py-3 text-surface-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3 font-semibold text-surface-800">{item.shade_number || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      item.blind_type === 'roller' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                    }`}>
                      {item.blind_type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${widthBad ? 'text-red-600 font-bold' : 'text-surface-700'}`}>
                    {item.width.toFixed(3)}
                    {widthBad && <span className="ml-1 text-red-400" title={`Exceeds roll width ${rollWidth}m`}>⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-surface-700">{item.height.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right font-mono text-surface-500">{item.valence > 0 ? item.valence.toFixed(3) : '—'}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${heightBad ? 'text-red-600' : 'text-brand-700'}`}>
                    {finalH.toFixed(3)}
                    {heightBad && <span className="ml-1 text-red-400" title={`Exceeds max roll length ${MAX_ROLL_LENGTH}m`}>⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-surface-800">{item.quantity}</td>
                  <td className="px-4 py-3 text-surface-600 text-xs">{item.material_type}</td>
                  <td className="px-4 py-3 text-surface-600 text-xs">{item.color}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-body border-t border-surface-100 bg-surface-50">
        <div className="flex items-center gap-6 text-xs text-surface-500 flex-wrap">
          <span>Roll width: <strong className="text-surface-700">{rollWidth}m</strong></span>
          <span>Max roll length: <strong className="text-surface-700">{MAX_ROLL_LENGTH}m</strong></span>
          <span>Items: <strong className="text-surface-700">{items.length}</strong></span>
          <span>Total qty: <strong className="text-surface-700">{totalQty}</strong></span>
        </div>
      </div>
    </div>
  )
}

/* ── Full-body Pieces Modal ── */
function PiecesModal({ items, result, onClose }: { items: WorkOrderItem[]; result: OptimizeResponse; onClose: () => void }) {
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const rollerCount = items.filter(i => i.blind_type === 'roller').reduce((s, i) => s + i.quantity, 0)
  const zebraCount = items.filter(i => i.blind_type === 'zebra').reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-900/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex-1 flex flex-col bg-white w-full h-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
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

          {/* Summary badges */}
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="badge bg-surface-100 text-surface-700 border border-surface-200">
                <Package size={11} className="mr-1" /> {items.length} items
              </span>
              <span className="badge bg-brand-50 text-brand-700 border border-brand-200">
                <Scissors size={11} className="mr-1" /> {totalQty} pcs total
              </span>
              {rollerCount > 0 && (
                <span className="badge bg-blue-50 text-blue-700 border border-blue-200">Roller: {rollerCount}</span>
              )}
              {zebraCount > 0 && (
                <span className="badge bg-purple-50 text-purple-700 border border-purple-200">Zebra: {zebraCount}</span>
              )}
            </div>
            <div className="h-6 w-px bg-surface-200" />
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-surface-100 hover:bg-surface-200 flex items-center justify-center transition-colors"
            >
              <X size={16} className="text-surface-600" />
            </button>
          </div>
        </div>

        {/* Job summary strip */}
        <div className="bg-surface-50 border-b border-surface-200 px-6 py-3 shrink-0">
          <div className="flex items-center gap-6 flex-wrap">
            <SummaryChip label="Sheets" value={result.total_sheets} color="text-surface-800" />
            <SummaryChip label="Utilization" value={`${result.utilization_percent}%`} color="text-emerald-600" />
            <SummaryChip label="Waste" value={`${result.waste_percent}%`} color="text-red-500" />
            <SummaryChip label="Roll Width" value={`${result.roll_width}m`} color="text-brand-600" />
            <SummaryChip label="Leftovers Reused" value={result.total_leftovers_used} color="text-amber-600" />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-50 shadow-sm">
                <th className="text-left px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">#</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Shade #</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Type</th>
                <th className="text-right px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Width (m)</th>
                <th className="text-right px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Height (m)</th>
                <th className="text-right px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Valence (m)</th>
                <th className="text-right px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Final H (m)</th>
                <th className="text-right px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Qty</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Material</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Color</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Pattern</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const finalH = item.blind_type === 'roller'
                  ? item.height + item.valence
                  : item.height * 2 + item.valence
                return (
                  <tr key={item.id} className={`border-b border-surface-100 hover:bg-brand-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-surface-50/50'}`}>
                    <td className="px-5 py-3.5 text-surface-400 text-xs font-mono">{String(idx + 1).padStart(2, '0')}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-surface-800">{item.shade_number || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        item.blind_type === 'roller'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {item.blind_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-surface-700">{item.width.toFixed(3)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-surface-700">{item.height.toFixed(3)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-surface-500">{item.valence > 0 ? item.valence.toFixed(3) : '—'}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-brand-700">{finalH.toFixed(3)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 text-brand-800 text-xs font-bold">
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-surface-600 text-xs">{item.material_type}</td>
                    <td className="px-5 py-3.5 text-surface-600 text-xs">{item.color}</td>
                    <td className="px-5 py-3.5 text-surface-500 text-xs">{item.pattern || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Modal footer */}
        <div className="bg-white border-t border-surface-200 px-6 py-4 flex items-center justify-between shrink-0">
          <p className="text-xs text-surface-400">
            Showing {items.length} piece line{items.length !== 1 ? 's' : ''} · {totalQty} total units
          </p>
          <button onClick={onClose} className="btn-brand px-6 py-2.5 text-sm font-semibold">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  )
}
