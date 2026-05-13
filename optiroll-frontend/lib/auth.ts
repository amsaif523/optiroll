const TOKEN_KEY = 'optiroll_token'

export interface AuthUser {
  id: number
  username: string
  full_name: string
  role: string
}

export function getToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|; )optiroll_token=([^;]*)/)
  return match ? match[1] : null
}

export function setToken(token: string): void {
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${TOKEN_KEY}=${token}; path=/; expires=${expires}; SameSite=Lax`
}

export function clearToken(): void {
  document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}

export function getUser(): AuthUser | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { id: payload.id, username: payload.username, full_name: payload.full_name, role: payload.role }
  } catch {
    return null
  }
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
