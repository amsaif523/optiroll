'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  Search, Plus, Edit2, Trash2, Upload, Download, X,
  AlertCircle, CheckCircle2, Loader2, Package, ChevronLeft, ChevronRight
} from 'lucide-react'
import { getToken } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

interface Product {
  id: number
  product_name: string
  product_code: string
  unit: string
  sale_rate: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

interface PagedResponse {
  rows: Product[]
  total: number
  page: number
  limit: number
  total_pages: number
}

const UNITS = ['SQFT', 'MTR', 'PCS', 'RFT', 'NOS']
const LIMIT = 25

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  return res
}

const emptyForm = { product_name: '', product_code: '', unit: 'SQFT', sale_rate: '' }

export default function InventoryView() {
  const [data, setData] = useState<PagedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  // import/export
  const [importLoading, setImportLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const loadProducts = useCallback(async (pg = page, q = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) })
      if (q) params.set('q', q)
      const res = await apiFetch(`/products?${params}`)
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch {
      // error handled silently; table stays empty
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { loadProducts(page, search) }, [page, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (v: string) => {
    setSearchInput(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setSearch(v)
    }, 350)
  }

  // --- CRUD ---
  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditId(p.id)
    setForm({
      product_name: p.product_name,
      product_code: p.product_code,
      unit: p.unit,
      sale_rate: p.sale_rate != null ? String(p.sale_rate) : ''
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.product_name.trim()) { setFormError('Product name is required'); return }
    if (!form.product_code.trim()) { setFormError('Product code is required'); return }
    setFormLoading(true)
    setFormError('')
    try {
      const body = {
        product_name: form.product_name.trim(),
        product_code: form.product_code.trim(),
        unit: form.unit,
        sale_rate: form.sale_rate !== '' ? Number(form.sale_rate) : null
      }
      const res = await apiFetch(
        editId ? `/products/${editId}` : '/products',
        { method: editId ? 'PUT' : 'POST', body: JSON.stringify(body) }
      )
      const json = await res.json()
      if (!json.success) { setFormError(json.error || 'Save failed'); return }
      setModalOpen(false)
      setPage(1)
      loadProducts(1, search)
      showToast('success', editId ? 'Product updated' : 'Product added')
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setFormLoading(false)
    }
  }

  const confirmDelete = (p: Product) => {
    setDeleteId(p.id)
    setDeleteName(p.product_name)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleteLoading(true)
    try {
      await apiFetch(`/products/${deleteId}`, { method: 'DELETE' })
      setDeleteId(null)
      loadProducts(page, search)
      showToast('success', 'Product deleted')
    } catch {
      showToast('error', 'Delete failed')
    } finally {
      setDeleteLoading(false)
    }
  }

  // --- Import ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (rows.length < 2) { showToast('error', 'File appears empty'); return }

        const header = (rows[0] as string[]).map(h => String(h ?? '').toLowerCase().trim())
        const nameIdx = header.findIndex(h => h.includes('product name') || h === 'name')
        const codeIdx = header.findIndex(h => h.includes('product code') || h === 'code')
        const unitIdx = header.findIndex(h => h.includes('unit') || h.includes('uom'))
        const rateIdx = header.findIndex(h => h.includes('rate') || h.includes('price') || h.includes('sale'))

        if (nameIdx < 0 || codeIdx < 0) {
          showToast('error', 'Could not find "Product Name" and "Product Code" columns')
          return
        }

        const products = (rows.slice(1) as unknown[][])
          .map(r => ({
            product_name: String((r as unknown[])[nameIdx] ?? '').trim(),
            product_code: String((r as unknown[])[codeIdx] ?? '').trim(),
            unit: unitIdx >= 0 ? String((r as unknown[])[unitIdx] ?? 'SQFT').trim() || 'SQFT' : 'SQFT',
            sale_rate: rateIdx >= 0 && (r as unknown[])[rateIdx] != null && (r as unknown[])[rateIdx] !== ''
              ? Number((r as unknown[])[rateIdx])
              : null
          }))
          .filter(p => p.product_name && p.product_code)

        if (products.length === 0) { showToast('error', 'No valid rows found in file'); return }

        setImportLoading(true)
        const res = await apiFetch('/products/import', {
          method: 'POST',
          body: JSON.stringify({ products })
        })
        const json = await res.json()
        if (json.success) {
          showToast('success', `Imported ${json.data.processed} products successfully`)
          setPage(1)
          loadProducts(1, search)
        } else {
          showToast('error', json.error || 'Import failed')
        }
      } catch (err) {
        showToast('error', 'Failed to parse file')
      } finally {
        setImportLoading(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // --- Export ---
  const handleExport = async () => {
    const token = getToken()
    const res = await fetch(`${API_BASE}/products/export`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'products.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-800">Product Inventory</h2>
          <p className="text-sm text-surface-400 mt-0.5">
            {data ? `${data.total.toLocaleString()} products` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
            className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2"
          >
            {importLoading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Import Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />

          <button onClick={handleExport} className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2">
            <Download size={15} /> Export CSV
          </button>

          <button onClick={openAdd} className="btn-brand flex items-center gap-1.5 text-sm px-3 py-2">
            <Plus size={15} /> Add Product
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="panel">
        <div className="panel-body">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              placeholder="Search by name or code…"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="text-left px-4 py-3 text-[11px] font-bold text-surface-400 uppercase tracking-wider">#</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-surface-400 uppercase tracking-wider">Product Name</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-surface-400 uppercase tracking-wider">Code</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-surface-400 uppercase tracking-wider">Unit</th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-surface-400 uppercase tracking-wider">Sale Rate</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-surface-400 uppercase tracking-wider">Created By</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-surface-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-surface-400">
                    <Loader2 size={22} className="animate-spin mx-auto mb-2" />
                    <span className="text-sm">Loading…</span>
                  </td>
                </tr>
              ) : !data || data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <Package size={32} className="mx-auto mb-2 text-surface-200" />
                    <p className="text-sm text-surface-400">No products found</p>
                    {search && <p className="text-xs text-surface-300 mt-1">Try a different search term</p>}
                  </td>
                </tr>
              ) : (
                data.rows.map((p, idx) => (
                  <tr key={p.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 text-surface-400 text-xs">
                      {(page - 1) * LIMIT + idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-surface-800">{p.product_name}</td>
                    <td className="px-4 py-3">
                      <span className="badge bg-surface-100 text-surface-700 border border-surface-200 font-mono text-xs">{p.product_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-blue-50 text-blue-700 border border-blue-100 text-xs">{p.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-surface-700">
                      {p.sale_rate != null ? p.sale_rate.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-surface-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-surface-500">{p.created_by_name || <span className="text-surface-300">—</span>}</td>
                    <td className="px-4 py-3 text-surface-400 text-xs whitespace-nowrap">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => confirmDelete(p)}
                          className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="px-4 py-3 border-t border-surface-100 flex items-center justify-between">
            <span className="text-xs text-surface-400">
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, data.total)} of {data.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 text-surface-400 hover:text-surface-700 disabled:opacity-30 rounded-lg hover:bg-surface-100 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium text-surface-600 px-2">
                {page} / {data.total_pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="p-1.5 text-surface-400 hover:text-surface-700 disabled:opacity-30 rounded-lg hover:bg-surface-100 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <h3 className="font-bold text-surface-800">{editId ? 'Edit Product' : 'Add Product'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-surface-400 hover:text-surface-700 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                  <AlertCircle size={15} /> {formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1.5">Product Name *</label>
                <input
                  type="text"
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. BLACK-OUT FB-20"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-600 mb-1.5">Product Code *</label>
                <input
                  type="text"
                  value={form.product_code}
                  onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  placeholder="e.g. OS"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">Unit (UOM)</label>
                  <select
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-600 mb-1.5">Sale Rate</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.sale_rate}
                    onChange={e => setForm(f => ({ ...f, sale_rate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-100">
              <button onClick={() => setModalOpen(false)} className="btn-ghost text-sm px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={formLoading} className="btn-brand text-sm px-4 py-2 flex items-center gap-2">
                {formLoading && <Loader2 size={14} className="animate-spin" />}
                {editId ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-surface-800">Delete Product?</h3>
                <p className="text-sm text-surface-500 mt-1">
                  <span className="font-medium text-surface-700">{deleteName}</span> will be permanently removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-ghost text-sm px-4 py-2">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
              >
                {deleteLoading && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
