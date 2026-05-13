'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Scissors, Eye, EyeOff, Loader2, AlertCircle, Lock, User } from 'lucide-react'
import { setToken } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

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
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)',
        backgroundSize: '20px 20px'
      }} />

      <div className="relative w-full max-w-md">
        {/* Logo card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/15 backdrop-blur rounded-2xl mb-4 shadow-xl">
            <Scissors size={30} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">OptiRoll</h1>
          <p className="text-brand-200 text-sm mt-1 font-medium tracking-wider uppercase">
            Cutting Optimization System
          </p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-surface-50 border-b border-surface-200 px-8 py-5">
            <h2 className="text-lg font-bold text-surface-800">Sign in to your account</h2>
            <p className="text-sm text-surface-400 mt-0.5">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
            {error && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">
                <AlertCircle size={16} className="shrink-0" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                  className="w-full pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-brand w-full py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Signing in…</>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="bg-surface-50 border-t border-surface-200 px-8 py-4">
            <p className="text-xs text-surface-400 text-center">
              OptiRoll v1.0.0 · Blinds Manufacturing Optimization
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
