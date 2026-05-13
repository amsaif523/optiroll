import { getToken } from './auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

export async function fetchJSON(url: string, options?: RequestInit) {
  const token = getToken()
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  const data = await res.json()
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data.data
}

export const api = {
  optimize: (body: unknown) => fetchJSON('/optimize/run', { method: 'POST', body: JSON.stringify(body) }),
}
