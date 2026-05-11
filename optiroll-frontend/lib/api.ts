const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data.data
}

export const api = {
  optimize: (body: any) => fetchJSON('/optimize/run', { method: 'POST', body: JSON.stringify(body) }),
}
