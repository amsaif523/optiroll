'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Scissors, Eye, EyeOff, Loader2, AlertCircle, Lock, User, CheckCircle2 } from 'lucide-react'
import { setToken } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'
const YEAR = new Date().getFullYear()

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) { setError('Enter username and password'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Login failed')
      setToken(data.data.token)
      router.push('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col bg-[#0c1120] overflow-hidden">

        {/* Background grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)`,
          backgroundSize: '56px 56px'
        }} />

        {/* Glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />

        <div className="relative z-10 flex flex-col h-full px-14 py-12">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Scissors size={20} className="text-white" />
            </div>
            <span className="text-xl font-black text-white tracking-tight">OptiRoll</span>
          </div>

          {/* Centre content */}
          <div className="flex flex-col justify-center flex-1 py-12">
            {/* Eyebrow */}
            <span className="text-indigo-400 text-xs font-bold uppercase tracking-[0.18em] mb-5">
              Blinds Manufacturing
            </span>

            {/* Headline */}
            <h1 className="text-[3.25rem] font-black text-white leading-[1.08] tracking-tight mb-6">
              Cut smarter.<br />
              <span className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(90deg, #818cf8, #a5b4fc)' }}>
                Waste less.
              </span>
            </h1>

            <p className="text-slate-400 text-[15px] leading-relaxed max-w-[340px] mb-10">
              Plan every cut, reuse every offcut, and print A3-ready layouts — all in one place.
            </p>

            {/* Features */}
            <div className="space-y-3.5">
              {[
                'Smart cut layout for every order',
                'Per-piece roll width selection',
                'Automatic offcut reuse across jobs',
                'A3 print-ready cutting maps',
              ].map((text, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 size={17} className="text-indigo-400 shrink-0" />
                  <span className="text-[14px] text-slate-300 font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-slate-600 text-xs">
            © {YEAR} OptiRoll · v1.1.0
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-6 py-12">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Scissors size={18} className="text-white" />
          </div>
          <span className="text-lg font-black text-gray-900">OptiRoll</span>
        </div>

        <div className="w-full max-w-[340px]">
          <div className="mb-8">
            <h2 className="text-[1.6rem] font-black text-gray-900 tracking-tight leading-tight">
              Welcome back
            </h2>
            <p className="text-sm text-gray-400 mt-1.5">Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-5">
              <AlertCircle size={15} className="shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                  className="w-full pl-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-11 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold tracking-wide transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Signing in…</>
                : 'Sign In'
              }
            </button>
          </form>

          <p className="text-center text-[11px] text-gray-400 mt-8">
            © {YEAR} OptiRoll · Blinds Manufacturing
          </p>
        </div>
      </div>

    </div>
  )
}
