'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import DataTable, { TableColumn } from 'react-data-table-component'
import { DateRange } from 'react-date-range'
import type { Range, RangeKeyDict } from 'react-date-range'
import { WorkOrderItem, OptimizeResponse, AppSettings, Sheet } from '@/types'
import WorkOrderBuilder from '@/components/WorkOrderBuilder'
import CutMapCanvas from '@/components/CutMapCanvas'
import SettingsPanel from '@/components/SettingsPanel'
import GuideView from '@/components/GuideView'
import { getToken, getUser, clearToken, getInitials, AuthUser } from '@/lib/auth'
import {
  Scissors, Loader2, AlertCircle, FileText, BarChart3, CheckCircle2,
  Package, Recycle, Menu, X, Home as HomeIcon, Settings,
  FolderOpen, History, LogOut, List, Eye, TrendingUp, RotateCcw,
  Users, UserPlus, Shield, RefreshCw, Trash2, ClipboardList,
  Search, ChevronLeft, ChevronRight, PlusCircle, CalendarDays, ChevronDown, Sparkles, Lightbulb, Lock, BookOpen
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

type ActiveTab = 'dashboard' | 'workorder' | 'jobs' | 'leftovers' | 'activity' | 'users' | 'guide' | 'settings'

interface PagedResponse<T> {
  rows: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}

interface JobSummary {
  id: number
  work_order_number: string | null
  client_name: string | null
  status: string
  total_pieces: number
  total_sheets: number
  roll_width_used: number | null
  total_waste_percent: number
  total_utilization_percent: number
  created_at: string
}

interface JobDetail extends JobSummary {
  items: WorkOrderItem[]
  sheets: Sheet[]
}

interface JobStats {
  total_jobs: number
  total_pieces: number
  total_sheets: number
  avg_utilization: number
  avg_waste: number
}

interface LeftoverSummary {
  id: number
  original_roll_id: number | null
  width: number
  length: number
  material_type: string
  color: string
  pattern: string | null
  status: string
  source_job_id: number | null
  created_at: string
  updated_at: string
}

interface LeftoverStats {
  total_leftovers: number
  available_leftovers: number
  used_leftovers: number
  total_area: number
  available_area: number
}

interface ActivityEntry {
  id: number
  action: string
  action_label?: string
  entity_type: string | null
  entity_label?: string | null
  entity_id: number | null
  description: string | null
  username: string | null
  full_name: string | null
  created_at: string
}

interface AppUser {
  id: number
  username: string
  full_name: string
  role: string
  created_at: string
}

interface DashboardData {
  summary: {
    total_jobs: number
    total_pieces: number
    total_sheets: number
    avg_utilization: number
  }
  recent_jobs: JobSummary[]
  recent_activity: ActivityEntry[]
}

// 5-decimal precision for dimension values
const fmtDim = (v: number) => parseFloat(v.toFixed(5)).toString()
const fmtRollWidth = (v: number | string | null | undefined) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return `${n.toFixed(3).replace(/\.?0+$/, '')}m`
}

const dataTableStyles = {
  table: { style: { minWidth: '900px' } },
  headRow: {
    style: {
      minHeight: '42px',
      backgroundColor: '#f8fafc',
      borderBottomColor: '#e2e8f0',
    },
  },
  headCells: {
    style: {
      color: '#94a3b8',
      fontSize: '11px',
      fontWeight: 800,
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
    },
  },
  rows: {
    style: {
      minHeight: '52px',
      color: '#475569',
      borderBottomColor: '#f1f5f9',
    },
  },
  pagination: {
    style: {
      borderTopColor: '#f1f5f9',
      minHeight: '54px',
    },
  },
}

export default function Home() {
  const [items, setItems] = useState<WorkOrderItem[]>([])
  const [allowRotation, setAllowRotation] = useState(false)
  const [cutMode, setCutMode] = useState<'free' | 'guillotine'>('free')
  const [optimizeMode, setOptimizeMode] = useState<'quick' | 'deep'>('quick')
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
    leftover_reuse_threshold: 0.8,
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
          cut_mode: cutMode,
          mode: optimizeMode,
          leftover_threshold: appSettings.leftover_reuse_threshold,
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
    { icon: <PlusCircle size={18} />, label: 'New Order', tab: 'workorder' as ActiveTab },
    { icon: <FolderOpen size={18} />, label: 'Jobs', tab: 'jobs' as ActiveTab },
    { icon: <Recycle size={18} />, label: 'Leftovers', tab: 'leftovers' as ActiveTab },
    { icon: <History size={18} />, label: 'Activity', tab: 'activity' as ActiveTab },
    { icon: <Users size={18} />, label: 'Users', tab: 'users' as ActiveTab },
    { icon: <BookOpen size={18} />, label: 'User Guide', tab: 'guide' as ActiveTab },
    { icon: <Settings size={18} />, label: 'Settings', tab: 'settings' as ActiveTab },
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
            {activeTab !== 'dashboard' && (
              <span className="ml-2 badge bg-brand-50 text-brand-700 border border-brand-200">
                {activeTab}
              </span>
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
        <main className="flex-1 max-w-[1440px] mx-auto w-full px-6 py-6 pb-20">
          {activeTab === 'settings' ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-surface-800">Settings</h2>
                <p className="text-sm text-surface-400 mt-1">Control roll options, optimization limits, and production defaults.</p>
              </div>
              <SettingsPanel onSettingsChange={setAppSettings} />
            </div>
          ) : activeTab === 'jobs' ? (
            <JobsView />
          ) : activeTab === 'leftovers' ? (
            <LeftoversView />
          ) : activeTab === 'activity' ? (
            <ActivityView user={user} />
          ) : activeTab === 'users' ? (
            <UsersView user={user} />
          ) : activeTab === 'guide' ? (
            <GuideView />
          ) : activeTab === 'workorder' ? (
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
                  cutMode={cutMode}
                  onCutModeChange={setCutMode}
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

                {/* Smart suggestions: reads current items + settings and recommends tweaks */}
                <SmartSuggestions
                  items={items}
                  optimizeMode={optimizeMode}
                  cutMode={cutMode}
                  allowRotation={allowRotation}
                  leftoverThreshold={appSettings.leftover_reuse_threshold ?? 0.8}
                  onApplyDeep={() => setOptimizeMode('deep')}
                  onApplyRotation={() => setAllowRotation(true)}
                  onLockGrain={(ids) => setItems(items.map(i => ids.includes(i.id) ? { ...i, grain_locked: true } : i))}
                  onApplyThreshold={(v) => setAppSettings(s => ({ ...s, leftover_reuse_threshold: v }))}
                />

                {/* Generate buttons (Quick + Deep) + error — always at top of right column */}
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        if (items.length === 0) { setError('Add at least one piece'); return }
                        if (!workOrderNumber.trim()) { setError('Enter Work Order Number'); return }
                        const missingWidths = items.find(i => i.selected_widths.length === 0)
                        if (missingWidths) { setError(`Piece "${missingWidths.shade_number}" has no roll width selected.`); return }
                        setError('')
                        setOptimizeMode('quick')
                        setShowConfirmModal(true)
                      }}
                      disabled={loading || items.length === 0}
                      className="btn-brand col-span-2 py-3.5 text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading && optimizeMode === 'quick' ? <Loader2 size={18} className="animate-spin" /> : <Scissors size={18} />}
                      {loading && optimizeMode === 'quick' ? 'Processing…' : 'Generate Cutting Map'}
                    </button>
                    <button
                      onClick={() => {
                        if (items.length === 0) { setError('Add at least one piece'); return }
                        if (!workOrderNumber.trim()) { setError('Enter Work Order Number'); return }
                        const missingWidths = items.find(i => i.selected_widths.length === 0)
                        if (missingWidths) { setError(`Piece "${missingWidths.shade_number}" has no roll width selected.`); return }
                        setError('')
                        setOptimizeMode('deep')
                        setShowConfirmModal(true)
                      }}
                      disabled={loading || items.length === 0}
                      title="Genetic Algorithm — slower but finds 5-10% better packings on hard jobs"
                      className="py-3.5 text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-purple-100 text-purple-700 hover:from-purple-100 hover:to-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {loading && optimizeMode === 'deep' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      {loading && optimizeMode === 'deep' ? 'GA…' : 'Deep'}
                    </button>
                  </div>
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
                            Auto-selected: <strong>{fmtRollWidth(result.roll_width)}</strong> roll
                            {usedSuggestion && ` — ${usedSuggestion.utilization}% utilization, ${usedSuggestion.sheets} sheet(s)`}
                            {alternateSuggestion && (
                              <span className="text-emerald-500 font-normal">
                                {' '}(next best: {fmtRollWidth(alternateSuggestion.width)} at {alternateSuggestion.utilization}%)
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
                              No matching leftovers found. Used fresh {fmtRollWidth(result.roll_width)} roll.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {result.sheets.map(sheet => (
                      <CutMapCanvas key={sheet.sheet_number} sheet={sheet} maxRollLength={result.max_roll_length} />
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
          ) : (
            <DashboardView
              user={user}
              queuedPieces={items.length}
              onNewOrder={() => setActiveTab('workorder')}
              onOpenJobs={() => setActiveTab('jobs')}
              onOpenActivity={() => setActiveTab('activity')}
            />
          )}
        </main>

        {/* FOOTER */}
        <footer className={`fixed bottom-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-surface-200 py-3 px-6 transition-all duration-300 ${sidebarOpen ? 'left-56' : 'left-14'}`}>
          <div className="max-w-[1440px] mx-auto flex items-center justify-between text-xs text-surface-400">
            <div className="flex items-center gap-4">
              <span className="font-medium text-surface-500">&copy; {new Date().getFullYear()} OptiRoll</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Developed by <a href="https://amsaifinfotech.com/" target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:text-brand-700">Amsaif Infotech</a></span>
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
          cutMode={cutMode}
          optimizeMode={optimizeMode}
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

function formatDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).replace(',', '')
}

function formatDateOnly(value: string) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getDefaultDateRange() {
  const dateTo = new Date()
  const dateFrom = new Date(dateTo)
  dateFrom.setMonth(dateFrom.getMonth() - 1)
  return {
    date_from: formatDateInput(dateFrom),
    date_to: formatDateInput(dateTo),
  }
}

function formatAction(action: string, label?: string) {
  if (label) return label
  const labels: Record<string, string> = {
    'auth.login': 'Signed In',
    'job.optimized': 'Work Order Optimized',
    'job.deleted': 'Work Order Deleted',
    'settings.updated': 'Settings Updated',
    'user.created': 'User Created',
  }
  return labels[action] || action.split(/[._-]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function formatEntity(entity: string | null, label?: string | null) {
  if (label) return label
  if (!entity) return ''
  const labels: Record<string, string> = {
    user: 'User',
    job: 'Work Order',
    settings: 'Settings',
  }
  return labels[entity] || entity.charAt(0).toUpperCase() + entity.slice(1)
}

function formatArea(width: number | string, length: number | string) {
  const area = Number(width) * Number(length)
  if (!Number.isFinite(area)) return '-'
  return `${area.toFixed(2)}m²`
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  })
  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`)
  return data.data
}

function queryPath(path: string, params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value))
  })
  return `${path}?${qs.toString()}`
}

function PremiumSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)} className="select-premium">
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-surface-400" />
    </div>
  )
}

function TablePager({
  page, totalPages, total, limit, onPageChange
}: {
  page: number
  totalPages: number
  total: number
  limit: number
  onPageChange: (page: number) => void
}) {
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  return (
    <div className="flex items-center justify-between border-t border-surface-100 bg-surface-50 px-4 py-3 text-sm">
      <span className="text-surface-500">
        Showing <strong className="text-surface-700">{start}-{end}</strong> of <strong className="text-surface-700">{total}</strong>
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn-ghost px-2 py-1.5 disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="text-xs font-bold text-surface-500 min-w-20 text-center">
          Page {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn-ghost px-2 py-1.5 disabled:opacity-40"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function formatDateInput(date?: Date) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function DateRangeField({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string
  endDate: string
  onChange: (range: { date_from: string; date_to: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const selection: Range = {
    startDate: startDate ? new Date(`${startDate}T00:00:00`) : new Date(),
    endDate: endDate ? new Date(`${endDate}T00:00:00`) : new Date(),
    key: 'selection',
  }
  const label = startDate && endDate ? `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}` : 'Select date range'

  const handleChange = (ranges: RangeKeyDict) => {
    const selected = ranges.selection
    onChange({
      date_from: formatDateInput(selected.startDate),
      date_to: formatDateInput(selected.endDate),
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full bg-white border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-700 text-left flex items-center gap-2 shadow-sm hover:border-brand-500 hover:shadow focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
      >
        <CalendarDays size={14} className="text-surface-400" />
        <span className={startDate && endDate ? 'text-surface-700' : 'text-surface-400'}>{label}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-2 right-0 bg-white border border-surface-200 rounded-xl shadow-2xl overflow-hidden">
          <DateRange
            ranges={[selection]}
            onChange={handleChange}
            moveRangeOnFirstSelection={false}
            months={2}
            direction="horizontal"
            rangeColors={['#2563eb']}
          />
          <div className="border-t border-surface-100 p-2 flex justify-between">
            <button
              type="button"
              onClick={() => onChange(getDefaultDateRange())}
              className="btn-ghost text-xs px-3 py-1.5"
            >
              Last Month
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-brand text-xs px-3 py-1.5">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardView({
  user, queuedPieces, onNewOrder, onOpenJobs, onOpenActivity
}: {
  user: AuthUser | null
  queuedPieces: number
  onNewOrder: () => void
  onOpenJobs: () => void
  onOpenActivity: () => void
}) {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [summary, setSummary] = useState<DashboardData['summary']>({
    total_jobs: 0,
    total_pieces: 0,
    total_sheets: 0,
    avg_utilization: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      try {
        const data = await apiFetch<DashboardData>('/dashboard')
        if (alive) {
          setJobs(data.recent_jobs)
          setSummary(data.summary)
          setActivity(data.recent_activity)
        }
      } catch {
        if (alive) {
          setJobs([])
          setActivity([])
          setSummary({ total_jobs: 0, total_pieces: 0, total_sheets: 0, avg_utilization: 0 })
        }
      }
      if (alive) setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [user?.role])

  const avgUtil = Number(summary.avg_utilization || 0).toFixed(1)

  const recentJobColumns: TableColumn<JobSummary>[] = [
    { name: 'Work Order', selector: row => row.work_order_number || `Job #${row.id}`, cell: row => <span className="font-bold text-surface-800">{row.work_order_number || `Job #${row.id}`}</span>, minWidth: '170px' },
    { name: 'Client', selector: row => row.client_name || '-', minWidth: '170px' },
    { name: 'Pieces', selector: row => row.total_pieces, right: true, width: '95px' },
    { name: 'Sheets', selector: row => row.total_sheets, right: true, width: '95px' },
    { name: 'Util', selector: row => row.total_utilization_percent, right: true, cell: row => <span className="font-mono text-emerald-600">{row.total_utilization_percent}%</span>, width: '105px' },
    { name: 'Created', selector: row => row.created_at, cell: row => <span className="text-surface-500">{formatDate(row.created_at)}</span>, minWidth: '180px' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-brand-600 uppercase tracking-wider">Production Control</p>
          <h2 className="text-2xl font-black text-surface-900 mt-1">Dashboard</h2>
          <p className="text-sm text-surface-400 mt-1">Monitor work orders, utilization, user activity, and active production setup.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onOpenJobs} className="btn-ghost border border-surface-200 bg-white"><FolderOpen size={15} /> Work Orders</button>
          <button onClick={onNewOrder} className="btn-brand"><Scissors size={15} /> New Cutting Map</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat icon={<FolderOpen size={14} />} value={summary.total_jobs} label="Saved Jobs" color="text-surface-800" />
        <Stat icon={<Scissors size={14} />} value={summary.total_pieces} label="Total Pieces" color="text-brand-600" />
        <Stat icon={<BarChart3 size={14} />} value={`${avgUtil}%`} label="Avg Util" color="text-emerald-600" />
        <Stat icon={<ClipboardList size={14} />} value={queuedPieces} label="Draft Queue" color="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 panel overflow-hidden">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <FolderOpen size={16} className="text-brand-600" />
              <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Recent Work Orders</h3>
            </div>
            <button onClick={onOpenJobs} className="btn-ghost text-xs">View all</button>
          </div>
          <DataTable
            columns={recentJobColumns}
            data={jobs}
            progressPending={loading}
            customStyles={dataTableStyles}
            noDataComponent={<div className="py-10 text-sm text-surface-400">No work orders yet.</div>}
          />
        </div>

        <div className="xl:col-span-4 space-y-5">
          <div className="panel">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <PlusCircle size={16} className="text-brand-600" />
                <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Quick Actions</h3>
              </div>
            </div>
            <div className="panel-body grid gap-2">
              <button onClick={onNewOrder} className="btn-brand w-full justify-start"><Scissors size={16} /> Create work order</button>
              <button onClick={onOpenJobs} className="btn-ghost w-full justify-start bg-surface-50"><FolderOpen size={16} /> Review work orders</button>
              {user?.role === 'admin' && (
                <button onClick={onOpenActivity} className="btn-ghost w-full justify-start bg-surface-50"><History size={16} /> Check activity log</button>
              )}
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <History size={16} className="text-brand-600" />
                <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Recent Activity</h3>
              </div>
            </div>
            <div className="divide-y divide-surface-100">
              {user?.role !== 'admin' ? (
                <div className="p-4 text-sm text-surface-400">Admin access required.</div>
              ) : activity.length === 0 ? (
                <div className="p-4 text-sm text-surface-400">No recent activity.</div>
              ) : activity.map(row => (
                <div key={row.id} className="p-4">
                  <p className="text-sm font-semibold text-surface-700">{row.description || formatAction(row.action, row.action_label)}</p>
                  <p className="text-xs text-surface-400 mt-1">{row.full_name || row.username || 'System'} - {formatDate(row.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function JobsView() {
  const defaultDateRange = getDefaultDateRange()
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({ q: '', ...defaultDateRange })
  const [stats, setStats] = useState<JobStats>({
    total_jobs: 0,
    total_pieces: 0,
    total_sheets: 0,
    avg_utilization: 0,
    avg_waste: 0,
  })
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadJobs = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<PagedResponse<JobSummary>>(queryPath('/jobs', {
        page,
        limit: 20,
        ...filters,
      }))
      setJobs(data.rows)
      setTotal(data.total)
      setTotalPages(data.total_pages)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    }
    setLoading(false)
  }

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      setStats(await apiFetch<JobStats>(queryPath('/jobs/stats', {
        date_from: filters.date_from,
        date_to: filters.date_to,
      })))
    } catch {
      setStats({ total_jobs: 0, total_pieces: 0, total_sheets: 0, avg_utilization: 0, avg_waste: 0 })
    }
    setStatsLoading(false)
  }

  useEffect(() => { loadJobs() }, [page, filters])
  useEffect(() => { loadStats() }, [filters.date_from, filters.date_to])

  const updateFilters = (next: Partial<typeof filters>) => {
    setPage(1)
    setFilters(f => ({ ...f, ...next }))
  }

  const resetFilters = () => {
    setPage(1)
    setFilters({ q: '', ...getDefaultDateRange() })
  }

  const openJob = async (id: number) => {
    setError('')
    try {
      setSelectedJob(await apiFetch<JobDetail>('/jobs/detail', {
        method: 'POST',
        body: JSON.stringify({ id }),
      }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load job')
    }
  }

  const deleteJob = async (id: number) => {
    if (!confirm('Delete this work order and its saved cut maps?')) return
    setError('')
    try {
      await apiFetch('/jobs/delete', { method: 'POST', body: JSON.stringify({ id }) })
      setSelectedJob(null)
      await loadJobs()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete job')
    }
  }

  const jobColumns: TableColumn<JobSummary>[] = [
    {
      name: 'Work Order',
      selector: row => row.work_order_number || `Job #${row.id}`,
      sortable: true,
      cell: row => <span className="font-bold text-surface-800">{row.work_order_number || `Job #${row.id}`}</span>,
      minWidth: '170px',
    },
    { name: 'Client', selector: row => row.client_name || '-', sortable: true, minWidth: '180px' },
    {
      name: 'Status',
      selector: row => row.status,
      sortable: true,
      center: true,
      cell: row => <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">{row.status}</span>,
      width: '140px',
    },
    { name: 'Pieces', selector: row => row.total_pieces, sortable: true, right: true, width: '100px' },
    { name: 'Sheets', selector: row => row.total_sheets, sortable: true, right: true, width: '100px' },
    {
      name: 'Roll',
      selector: row => Number(row.roll_width_used || 0),
      sortable: true,
      right: true,
      cell: row => <span className="font-mono">{row.roll_width_used ? fmtRollWidth(row.roll_width_used) : '-'}</span>,
      width: '100px',
    },
    {
      name: 'Util',
      selector: row => Number(row.total_utilization_percent || 0),
      sortable: true,
      right: true,
      cell: row => <span className="font-mono text-emerald-600">{row.total_utilization_percent}%</span>,
      width: '110px',
    },
    { name: 'Created', selector: row => row.created_at, sortable: true, cell: row => <span className="text-surface-500">{formatDate(row.created_at)}</span>, minWidth: '190px' },
    {
      name: '',
      right: true,
      cell: row => (
        <div className="flex justify-end gap-1">
          <button onClick={() => openJob(row.id)} className="btn-ghost p-1.5" title="View"><Eye size={14} /></button>
          <button onClick={() => deleteJob(row.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
        </div>
      ),
      width: '110px',
    },
  ]

  if (selectedJob) {
    return (
      <WorkOrderDetailPage
        job={selectedJob}
        onBack={() => setSelectedJob(null)}
        onDelete={async () => {
          await deleteJob(selectedJob.id)
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-800">Work Orders</h2>
        </div>
        <button onClick={loadJobs} className="btn-ghost"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<FolderOpen size={14} />} value={statsLoading ? '-' : stats.total_jobs} label="Work Orders" color="text-surface-800" />
        <Stat icon={<Scissors size={14} />} value={statsLoading ? '-' : stats.total_pieces} label="Pieces" color="text-brand-600" />
        <Stat icon={<Package size={14} />} value={statsLoading ? '-' : stats.total_sheets} label="Sheets" color="text-amber-600" />
        <Stat icon={<BarChart3 size={14} />} value={statsLoading ? '-' : `${Number(stats.avg_utilization || 0).toFixed(1)}%`} label="Avg Util" color="text-emerald-600" />
        <Stat icon={<AlertCircle size={14} />} value={statsLoading ? '-' : `${Number(stats.avg_waste || 0).toFixed(1)}%`} label="Avg Waste" color="text-red-500" />
      </div>

      <div className="panel">
        <div className="panel-body grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input value={filters.q} onChange={e => updateFilters({ q: e.target.value })} placeholder="Work order or client" className="w-full pl-9" />
            </div>
          </div>
          <div className="md:col-span-6">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Date Range</label>
            <DateRangeField
              startDate={filters.date_from}
              endDate={filters.date_to}
              onChange={range => updateFilters(range)}
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button onClick={resetFilters} className="btn-ghost flex-1 py-2.5 border border-surface-200 bg-white" title="Reset filters"><RotateCcw size={14} /> Reset</button>
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <DataTable
          columns={jobColumns}
          data={jobs}
          progressPending={loading}
          customStyles={dataTableStyles}
          pagination
          paginationServer
          paginationPerPage={20}
          paginationTotalRows={total}
          paginationDefaultPage={page}
          paginationRowsPerPageOptions={[20]}
          paginationComponentOptions={{ noRowsPerPage: true }}
          onChangePage={setPage}
          noDataComponent={<div className="py-12 text-sm text-surface-400">No work orders saved yet.</div>}
        />
      </div>

    </div>
  )
}

function WorkOrderDetailPage({
  job,
  onBack,
  onDelete,
}: {
  job: JobDetail
  onBack: () => void
  onDelete: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <button onClick={onBack} className="btn-ghost px-2 py-1.5 mb-2">
            <ChevronLeft size={15} /> Back to work orders
          </button>
          <h2 className="text-xl font-black text-surface-900 truncate">{job.work_order_number || `Job #${job.id}`}</h2>
          <p className="text-sm text-surface-400 mt-1">
            {job.client_name || 'No client'} - {formatDate(job.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">{job.status}</span>
          <button onClick={handleDelete} disabled={deleting} className="btn-ghost border border-red-200 bg-white text-red-500 hover:text-red-600 disabled:opacity-50">
            <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<Package size={14} />} value={job.total_sheets} label="Sheets" color="text-surface-800" />
        <Stat icon={<Scissors size={14} />} value={job.total_pieces} label="Pieces" color="text-brand-600" />
        <Stat icon={<BarChart3 size={14} />} value={`${job.total_utilization_percent}%`} label="Utilization" color="text-emerald-600" />
        <Stat icon={<AlertCircle size={14} />} value={`${job.total_waste_percent}%`} label="Waste" color="text-red-500" />
        <Stat icon={<Package size={14} />} value={job.roll_width_used ? fmtRollWidth(job.roll_width_used) : '-'} label="Roll" color="text-amber-600" />
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <List size={16} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Pieces</h3>
          </div>
          <span className="text-xs font-semibold text-surface-400">{job.items.length} rows</span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs min-w-[820px]">
            <thead className="bg-surface-50 text-surface-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Shade</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">W"</th>
                <th className="px-4 py-3 text-right">H"</th>
                <th className="px-4 py-3 text-right">Val"</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-left">Material</th>
                <th className="px-4 py-3 text-left">Color</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {job.items.map((item, idx) => (
                <tr key={`${item.shade_number}-${idx}`} className="hover:bg-surface-50/70">
                  <td className="px-4 py-3 font-bold text-surface-800">{item.shade_number || '-'}</td>
                  <td className="px-4 py-3 capitalize">{item.blind_type}</td>
                  <td className="px-4 py-3 text-right font-mono">{parseFloat((Number(item.width) / 0.0254).toFixed(5)).toString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{parseFloat((Number(item.height) / 0.0254).toFixed(5)).toString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{parseFloat((Number(item.valence || 0) / 0.0254).toFixed(5)).toString()}</td>
                  <td className="px-4 py-3 text-right font-bold">{item.quantity}</td>
                  <td className="px-4 py-3">{item.material_type}</td>
                  <td className="px-4 py-3">{item.color}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors size={16} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Cut Maps</h3>
          </div>
          <span className="text-xs font-semibold text-surface-400">{job.sheets.length} sheet(s)</span>
        </div>
        {job.sheets.length === 0 ? (
          <div className="panel panel-body text-sm text-surface-400">No saved cut map found for this work order.</div>
        ) : (
          job.sheets.map(sheet => <CutMapCanvas key={sheet.sheet_number} sheet={sheet} />)
        )}
      </div>
    </div>
  )
}

function LeftoversView() {
  const defaultDateRange = getDefaultDateRange()
  const [leftovers, setLeftovers] = useState<LeftoverSummary[]>([])
  const [selectedLeftover, setSelectedLeftover] = useState<LeftoverSummary | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({ q: '', ...defaultDateRange })
  const [stats, setStats] = useState<LeftoverStats>({
    total_leftovers: 0,
    available_leftovers: 0,
    used_leftovers: 0,
    total_area: 0,
    available_area: 0,
  })
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadLeftovers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<PagedResponse<LeftoverSummary>>(queryPath('/leftovers', {
        page,
        limit: 20,
        ...filters,
      }))
      setLeftovers(data.rows)
      setTotal(data.total)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load leftovers')
    }
    setLoading(false)
  }

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      setStats(await apiFetch<LeftoverStats>(queryPath('/leftovers/stats', {
        date_from: filters.date_from,
        date_to: filters.date_to,
      })))
    } catch {
      setStats({ total_leftovers: 0, available_leftovers: 0, used_leftovers: 0, total_area: 0, available_area: 0 })
    }
    setStatsLoading(false)
  }

  useEffect(() => { loadLeftovers() }, [page, filters])
  useEffect(() => { loadStats() }, [filters.date_from, filters.date_to])

  const updateFilters = (next: Partial<typeof filters>) => {
    setPage(1)
    setFilters(f => ({ ...f, ...next }))
  }

  const resetFilters = () => {
    setPage(1)
    setFilters({ q: '', ...getDefaultDateRange() })
  }

  const openLeftover = async (id: number) => {
    setError('')
    try {
      setSelectedLeftover(await apiFetch<LeftoverSummary>('/leftovers/detail', {
        method: 'POST',
        body: JSON.stringify({ id }),
      }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load leftover')
    }
  }

  const deleteLeftover = async (id: number) => {
    if (!confirm('Delete this leftover record?')) return
    setError('')
    try {
      await apiFetch('/leftovers/delete', { method: 'POST', body: JSON.stringify({ id }) })
      setSelectedLeftover(null)
      await loadLeftovers()
      await loadStats()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete leftover')
    }
  }

  const columns: TableColumn<LeftoverSummary>[] = [
    { name: 'ID', selector: row => row.id, sortable: true, cell: row => <span className="font-bold text-surface-800">#{row.id}</span>, width: '90px' },
    { name: 'Material', selector: row => row.material_type, sortable: true, minWidth: '170px' },
    { name: 'Color', selector: row => row.color, sortable: true, minWidth: '140px' },
    { name: 'Pattern', selector: row => row.pattern || '-', sortable: true, minWidth: '140px' },
    { name: 'Width', selector: row => Number(row.width), sortable: true, right: true, cell: row => <span className="font-mono">{fmtRollWidth(row.width)}</span>, width: '110px' },
    { name: 'Length', selector: row => Number(row.length), sortable: true, right: true, cell: row => <span className="font-mono">{Number(row.length).toFixed(2)}m</span>, width: '110px' },
    { name: 'Area', selector: row => Number(row.width) * Number(row.length), sortable: true, right: true, cell: row => <span className="font-mono">{formatArea(row.width, row.length)}</span>, width: '110px' },
    { name: 'Status', selector: row => row.status, sortable: true, center: true, cell: row => <span className={`badge border ${row.status === 'available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-surface-50 text-surface-600 border-surface-200'}`}>{row.status}</span>, width: '140px' },
    { name: 'Created', selector: row => row.created_at, sortable: true, cell: row => <span className="text-surface-500">{formatDate(row.created_at)}</span>, minWidth: '190px' },
    {
      name: '',
      right: true,
      cell: row => (
        <div className="flex justify-end gap-1">
          <button onClick={() => openLeftover(row.id)} className="btn-ghost p-1.5" title="View"><Eye size={14} /></button>
          <button onClick={() => deleteLeftover(row.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
        </div>
      ),
      width: '110px',
    },
  ]

  if (selectedLeftover) {
    return (
      <LeftoverDetailPage
        leftover={selectedLeftover}
        onBack={() => setSelectedLeftover(null)}
        onDelete={() => deleteLeftover(selectedLeftover.id)}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-800">Leftovers</h2>
        <button onClick={loadLeftovers} className="btn-ghost"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<Recycle size={14} />} value={statsLoading ? '-' : stats.total_leftovers} label="Leftovers" color="text-surface-800" />
        <Stat icon={<CheckCircle2 size={14} />} value={statsLoading ? '-' : stats.available_leftovers} label="Available" color="text-emerald-600" />
        <Stat icon={<History size={14} />} value={statsLoading ? '-' : stats.used_leftovers} label="Used" color="text-surface-600" />
        <Stat icon={<Package size={14} />} value={statsLoading ? '-' : `${Number(stats.available_area || 0).toFixed(2)}m²`} label="Available Area" color="text-amber-600" />
        <Stat icon={<BarChart3 size={14} />} value={statsLoading ? '-' : `${Number(stats.total_area || 0).toFixed(2)}m²`} label="Total Area" color="text-brand-600" />
      </div>

      <div className="panel">
        <div className="panel-body grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input value={filters.q} onChange={e => updateFilters({ q: e.target.value })} placeholder="Material, color, pattern, job" className="w-full pl-9" />
            </div>
          </div>
          <div className="md:col-span-6">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Date Range</label>
            <DateRangeField
              startDate={filters.date_from}
              endDate={filters.date_to}
              onChange={range => updateFilters(range)}
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button onClick={resetFilters} className="btn-ghost flex-1 py-2.5 border border-surface-200 bg-white" title="Reset filters"><RotateCcw size={14} /> Reset</button>
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <DataTable
          columns={columns}
          data={leftovers}
          progressPending={loading}
          customStyles={dataTableStyles}
          pagination
          paginationServer
          paginationPerPage={20}
          paginationTotalRows={total}
          paginationDefaultPage={page}
          paginationRowsPerPageOptions={[20]}
          paginationComponentOptions={{ noRowsPerPage: true }}
          onChangePage={setPage}
          noDataComponent={<div className="py-12 text-sm text-surface-400">No leftovers found.</div>}
        />
      </div>
    </div>
  )
}

function LeftoverDetailPage({
  leftover,
  onBack,
  onDelete,
}: {
  leftover: LeftoverSummary
  onBack: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <button onClick={onBack} className="btn-ghost px-2 py-1.5 mb-2">
            <ChevronLeft size={15} /> Back to leftovers
          </button>
          <h2 className="text-xl font-black text-surface-900">Leftover #{leftover.id}</h2>
          <p className="text-sm text-surface-400 mt-1">{leftover.material_type} - {leftover.color} - {formatDate(leftover.created_at)}</p>
        </div>
        <button onClick={onDelete} className="btn-ghost border border-red-200 bg-white text-red-500 hover:text-red-600">
          <Trash2 size={14} /> Delete
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<Package size={14} />} value={fmtRollWidth(leftover.width)} label="Width" color="text-brand-600" />
        <Stat icon={<Scissors size={14} />} value={`${Number(leftover.length).toFixed(2)}m`} label="Length" color="text-amber-600" />
        <Stat icon={<BarChart3 size={14} />} value={formatArea(leftover.width, leftover.length)} label="Area" color="text-emerald-600" />
        <Stat icon={<FolderOpen size={14} />} value={leftover.source_job_id ? `#${leftover.source_job_id}` : '-'} label="Source Job" color="text-surface-800" />
        <Stat icon={<CheckCircle2 size={14} />} value={leftover.status} label="Status" color={leftover.status === 'available' ? 'text-emerald-600' : 'text-surface-600'} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <Recycle size={16} className="text-brand-600" />
            <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Details</h3>
          </div>
        </div>
        <div className="panel-body grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <DetailRow label="Material" value={leftover.material_type} />
          <DetailRow label="Color" value={leftover.color} />
          <DetailRow label="Pattern" value={leftover.pattern || '-'} />
          <DetailRow label="Original Roll" value={leftover.original_roll_id ? `#${leftover.original_roll_id}` : '-'} />
          <DetailRow label="Created" value={formatDate(leftover.created_at)} />
          <DetailRow label="Updated" value={formatDate(leftover.updated_at)} />
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-surface-400">{label}</p>
      <p className="mt-1 font-semibold text-surface-800">{value}</p>
    </div>
  )
}

function ActivityView({ user }: { user: AuthUser | null }) {
  const defaultDateRange = getDefaultDateRange()
  const [logs, setLogs] = useState<ActivityEntry[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({ q: '', action: '', entity_type: '', ...defaultDateRange })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadLogs = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<PagedResponse<ActivityEntry>>(queryPath('/activity', {
        page,
        limit: 20,
        ...filters,
      }))
      setLogs(data.rows)
      setTotal(data.total)
      setTotalPages(data.total_pages)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load activity')
    }
    setLoading(false)
  }

  useEffect(() => { if (user?.role === 'admin') loadLogs(); else setLoading(false) }, [user?.role, page, filters])

  const updateFilters = (next: Partial<typeof filters>) => {
    setPage(1)
    setFilters(f => ({ ...f, ...next }))
  }

  const resetFilters = () => {
    setPage(1)
    setFilters({ q: '', action: '', entity_type: '', ...getDefaultDateRange() })
  }

  const activityColumns: TableColumn<ActivityEntry>[] = [
    { name: 'When', selector: row => row.created_at, sortable: true, cell: row => <span className="text-surface-500">{formatDate(row.created_at)}</span>, minWidth: '190px' },
    { name: 'User', selector: row => row.full_name || row.username || 'System', sortable: true, cell: row => <span className="font-semibold text-surface-700">{row.full_name || row.username || 'System'}</span>, minWidth: '170px' },
    { name: 'Action', selector: row => formatAction(row.action, row.action_label), sortable: true, cell: row => <span className="badge bg-brand-50 text-brand-700 border border-brand-200 normal-case tracking-normal">{formatAction(row.action, row.action_label)}</span>, minWidth: '190px' },
    { name: 'Entity', selector: row => formatEntity(row.entity_type, row.entity_label) || '-', sortable: true, cell: row => <span className="text-surface-500">{row.entity_type ? `${formatEntity(row.entity_type, row.entity_label)}${row.entity_id ? ` #${row.entity_id}` : ''}` : '-'}</span>, minWidth: '150px' },
    { name: 'Details', selector: row => row.description || '-', wrap: true, grow: 2, cell: row => <span className="text-surface-600">{row.description || '-'}</span> },
  ]

  if (user?.role !== 'admin') {
    return <AdminOnly title="Activity Log" />
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-800">Activity Log</h2>
        </div>
        <button onClick={loadLogs} className="btn-ghost"><RefreshCw size={14} /> Refresh</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
      <div className="panel">
        <div className="panel-body grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input value={filters.q} onChange={e => updateFilters({ q: e.target.value })} placeholder="User, action, details" className="w-full pl-9" />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Action</label>
            <PremiumSelect value={filters.action} onChange={action => updateFilters({ action })}>
              <option value="">All</option>
              <option value="auth.login">Login</option>
              <option value="job.optimized">Job Optimized</option>
              <option value="job.deleted">Job Deleted</option>
              <option value="settings.updated">Settings Updated</option>
              <option value="user.created">User Created</option>
            </PremiumSelect>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Entity</label>
            <PremiumSelect value={filters.entity_type} onChange={entity_type => updateFilters({ entity_type })}>
              <option value="">All</option>
              <option value="user">User</option>
              <option value="job">Work Order</option>
              <option value="settings">Settings</option>
            </PremiumSelect>
          </div>
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Date Range</label>
            <DateRangeField
              startDate={filters.date_from}
              endDate={filters.date_to}
              onChange={range => updateFilters(range)}
            />
          </div>
          <button onClick={resetFilters} className="btn-ghost py-2.5 border border-surface-200 bg-white" title="Reset filters"><RotateCcw size={14} /> Reset</button>
        </div>
      </div>
      <div className="panel overflow-hidden">
        <DataTable
          columns={activityColumns}
          data={logs}
          progressPending={loading}
          customStyles={dataTableStyles}
          pagination
          paginationServer
          paginationPerPage={20}
          paginationTotalRows={total}
          paginationDefaultPage={page}
          paginationRowsPerPageOptions={[20]}
          paginationComponentOptions={{ noRowsPerPage: true }}
          onChangePage={setPage}
          noDataComponent={<div className="py-12 text-sm text-surface-400">No activity recorded yet.</div>}
        />
      </div>
    </div>
  )
}

function UsersView({ user }: { user: AuthUser | null }) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [form, setForm] = useState({ username: '', full_name: '', password: '', role: 'operator' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({ q: '', role: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<PagedResponse<AppUser>>(queryPath('/users', {
        page,
        limit: 20,
        ...filters,
      }))
      setUsers(data.rows)
      setTotal(data.total)
      setTotalPages(data.total_pages)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    }
    setLoading(false)
  }

  useEffect(() => { if (user?.role === 'admin') loadUsers(); else setLoading(false) }, [user?.role, page, filters])

  const updateFilters = (next: Partial<typeof filters>) => {
    setPage(1)
    setFilters(f => ({ ...f, ...next }))
  }

  const resetFilters = () => {
    setPage(1)
    setFilters({ q: '', role: '' })
  }

  const createUser = async () => {
    setSaving(true)
    setError('')
    try {
      await apiFetch<AppUser>('/users', { method: 'POST', body: JSON.stringify(form) })
      setForm({ username: '', full_name: '', password: '', role: 'operator' })
      await loadUsers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    }
    setSaving(false)
  }

  const userColumns: TableColumn<AppUser>[] = [
    { name: 'Name', selector: row => row.full_name, sortable: true, cell: row => <span className="font-bold text-surface-800">{row.full_name}</span>, minWidth: '220px' },
    { name: 'Username', selector: row => row.username, sortable: true, cell: row => <span className="text-surface-600">{row.username}</span>, minWidth: '170px' },
    {
      name: 'Role',
      selector: row => row.role,
      sortable: true,
      cell: row => <span className={`badge border ${row.role === 'admin' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-surface-50 text-surface-600 border-surface-200'}`}><Shield size={11} className="mr-1" />{row.role}</span>,
      minWidth: '140px',
    },
    { name: 'Created', selector: row => row.created_at, sortable: true, cell: row => <span className="text-surface-500">{formatDate(row.created_at)}</span>, minWidth: '190px' },
  ]

  if (user?.role !== 'admin') {
    return <AdminOnly title="Users" />
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-4 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-surface-800">Users</h2>
          <p className="text-sm text-surface-400 mt-1">Create operator or admin accounts.</p>
        </div>
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2"><UserPlus size={16} className="text-brand-600" /><h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">New User</h3></div>
          </div>
          <div className="panel-body space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Username</label>
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="w-full" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Full Name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="w-full" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Password</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="w-full" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Role</label>
              <PremiumSelect value={form.role} onChange={role => setForm(f => ({ ...f, role }))}>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </PremiumSelect>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
            <button onClick={createUser} disabled={saving} className="btn-brand w-full disabled:opacity-50">
              <UserPlus size={16} /> {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      </div>
      <div className="xl:col-span-8 space-y-5">
        <div className="panel">
          <div className="panel-body grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-7">
              <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input value={filters.q} onChange={e => updateFilters({ q: e.target.value })} placeholder="Name or username" className="w-full pl-9" />
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">Role</label>
              <PremiumSelect value={filters.role} onChange={role => updateFilters({ role })}>
                <option value="">All</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </PremiumSelect>
            </div>
            <button onClick={resetFilters} className="md:col-span-2 btn-ghost py-2.5 border border-surface-200 bg-white" title="Reset filters"><RotateCcw size={14} /> Reset</button>
          </div>
        </div>
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div className="flex items-center gap-2"><Users size={16} className="text-brand-600" /><h3 className="text-sm font-bold text-surface-700 uppercase tracking-wide">Accounts</h3></div>
            <button onClick={loadUsers} className="btn-ghost p-1.5"><RefreshCw size={14} /></button>
          </div>
          <DataTable
            columns={userColumns}
            data={users}
            progressPending={loading}
            customStyles={dataTableStyles}
            pagination
            paginationServer
            paginationPerPage={20}
            paginationTotalRows={total}
            paginationDefaultPage={page}
            paginationRowsPerPageOptions={[20]}
            paginationComponentOptions={{ noRowsPerPage: true }}
            onChangePage={setPage}
            noDataComponent={<div className="py-12 text-sm text-surface-400">No users found.</div>}
          />
        </div>
      </div>
    </div>
  )
}

function AdminOnly({ title }: { title: string }) {
  return (
    <div className="panel flex flex-col items-center justify-center py-24 text-center">
      <Shield size={32} className="text-surface-300 mb-3" />
      <h2 className="text-base font-bold text-surface-800">{title}</h2>
      <p className="text-sm text-surface-400 mt-1">Admin access is required for this section.</p>
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
                      : <span className="text-surface-600">{item.selected_widths.map(fmtRollWidth).join(', ')}</span>
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
            <span className="font-bold text-brand-600">{fmtRollWidth(result.roll_width)}</span>
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
                              <span key={w} className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] font-bold border border-brand-200">{fmtRollWidth(w)}</span>
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

// Inline-recommends setting tweaks based on the current work order shape.
// Suggestions only render when the recommendation differs from current state,
// so the panel disappears once everything is dialled in.
function SmartSuggestions({
  items, optimizeMode, cutMode, allowRotation, leftoverThreshold,
  onApplyDeep, onApplyRotation, onLockGrain, onApplyThreshold,
}: {
  items: WorkOrderItem[]
  optimizeMode: 'quick' | 'deep'
  cutMode: 'free' | 'guillotine'
  allowRotation: boolean
  leftoverThreshold: number
  onApplyDeep: () => void
  onApplyRotation: () => void
  onLockGrain: (ids: string[]) => void
  onApplyThreshold: (v: number) => void
}) {
  if (items.length === 0) return null

  const PATTERN_HINT_RE = /strip|pattern|grain|floral|check|plaid|print/i

  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const patternedUnlocked = items.filter(i =>
    !i.grain_locked && PATTERN_HINT_RE.test(`${i.pattern} ${i.color}`)
  )
  const widths = items.flatMap(i => i.selected_widths)
  const widthRange = widths.length > 0 ? Math.max(...widths) - Math.min(...widths) : 0
  const bucketCount = new Set(items.map(i => `${i.material_type}|${i.color}|${i.pattern}`)).size

  type Suggestion = {
    key: string
    icon: React.ReactNode
    text: React.ReactNode
    apply?: () => void
    applyLabel?: string
  }
  const suggestions: Suggestion[] = []

  // 1. Large/varied jobs benefit measurably from the GA
  if (optimizeMode === 'quick' && (totalQty >= 20 || items.length >= 10)) {
    suggestions.push({
      key: 'deep',
      icon: <Sparkles size={13} className="text-purple-600" />,
      text: <>
        <strong>{totalQty} pieces</strong> across {items.length} lines —
        Deep mode usually saves <strong>5–10%</strong> more material here.
      </>,
      apply: onApplyDeep,
      applyLabel: 'Use Deep',
    })
  }

  // 2. Patterned/striped fabric should be grain-locked so the optimiser won't rotate it
  if (patternedUnlocked.length > 0) {
    const names = patternedUnlocked.map(i => i.shade_number || '?').join(', ')
    suggestions.push({
      key: 'grain',
      icon: <Lock size={13} className="text-amber-600" />,
      text: <>
        Patterned fabric detected on <strong>{patternedUnlocked.length} piece(s)</strong>: {names}.
        Grain-lock so rotation won&apos;t misalign the print.
      </>,
      apply: () => onLockGrain(patternedUnlocked.map(p => p.id)),
      applyLabel: 'Lock grain',
    })
  }

  // 3. Rotation off + no grain-locks = leaving free density on the table
  if (!allowRotation && patternedUnlocked.length === 0 && items.every(i => !i.grain_locked)) {
    suggestions.push({
      key: 'rotation',
      icon: <RotateCcw size={13} className="text-emerald-600" />,
      text: <>No grain-locked pieces — enabling <strong>90° rotation</strong> lets the optimiser flip pieces to fit better.</>,
      apply: onApplyRotation,
      applyLabel: 'Allow rotation',
    })
  }

  // 4. Wide width range = narrow leftovers may help; current threshold too strict
  if (widthRange >= 0.5 && leftoverThreshold >= 0.75) {
    suggestions.push({
      key: 'threshold',
      icon: <Recycle size={13} className="text-blue-600" />,
      text: <>Mixed roll-width job ({widthRange.toFixed(1)}m spread). Lowering the leftover threshold to <strong>60%</strong> typically reuses more offcuts.</>,
      apply: () => onApplyThreshold(0.6),
      applyLabel: 'Set 60%',
    })
  }

  // 5. Many distinct material/colour/pattern buckets — informational only
  if (bucketCount >= 3) {
    suggestions.push({
      key: 'buckets',
      icon: <Package size={13} className="text-surface-500" />,
      text: <><strong>{bucketCount} material/colour groups</strong> — each runs as its own packing pass automatically. Cross-group merging applies within each group.</>,
    })
  }

  // 6. Cut mode is a shop-floor decision we can only inform on
  if (cutMode === 'free') {
    suggestions.push({
      key: 'cutmode',
      icon: <Scissors size={13} className="text-amber-600" />,
      text: <><strong>Free cut mode</strong> gives best density but may need non-straight cuts. Switch to Guillotine if your machine only does straight cross-cuts.</>,
    })
  }

  if (suggestions.length === 0) return null

  return (
    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-3 space-y-2 shadow-sm">
      <div className="flex items-center gap-2">
        <Lightbulb size={14} className="text-amber-600" />
        <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
          Smart Suggestions · {suggestions.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {suggestions.map(s => (
          <li key={s.key} className="flex items-start gap-2 text-[12px] text-surface-700 leading-relaxed">
            <span className="mt-0.5 shrink-0">{s.icon}</span>
            <span className="flex-1">{s.text}</span>
            {s.apply && (
              <button
                onClick={s.apply}
                className="shrink-0 px-2 py-0.5 rounded-md bg-white border border-amber-300 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors"
              >
                {s.applyLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ConfirmGenerateModal({
  items, workOrderNumber, clientName, allowRotation, cutMode, optimizeMode, maxRollLength, onConfirm, onCancel
}: {
  items: WorkOrderItem[]
  workOrderNumber: string
  clientName: string
  allowRotation: boolean
  cutMode: 'free' | 'guillotine'
  optimizeMode: 'quick' | 'deep'
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
            <div className="flex justify-between">
              <span className="text-surface-400 font-medium">Cut mode</span>
              <span className={`font-bold ${cutMode === 'guillotine' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {cutMode === 'guillotine' ? 'Guillotine (real cuts)' : 'Free (max density)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400 font-medium">Optimisation</span>
              <span className={`font-bold ${optimizeMode === 'deep' ? 'text-purple-600' : 'text-brand-600'}`}>
                {optimizeMode === 'deep' ? 'Deep (GA, ~1–5s)' : 'Quick (heuristic)'}
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
                      <td className="px-3 py-2 text-surface-600 text-[10px]">{item.selected_widths.map(fmtRollWidth).join(', ')}</td>
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
