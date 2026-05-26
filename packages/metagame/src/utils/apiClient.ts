// Tiny fetch wrapper.
// Resolves a base URL (VITE_API_ORIGIN env, else same-origin).
// Attaches Authorization: Bearer <jwt> when one is in walletStore.
// Parses JSON and throws on non-2xx.

import { useWalletStore } from '../store/walletStore'

const ORIGIN = (import.meta as any).env?.VITE_API_ORIGIN ?? ''

function url(path: string): string {
  if (path.startsWith('http')) return path
  return ORIGIN + (path.startsWith('/') ? path : '/' + path)
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {})
  headers.set('Content-Type', 'application/json')
  const jwt = useWalletStore.getState().jwt
  if (jwt) headers.set('Authorization', `Bearer ${jwt}`)

  const resp = await fetch(url(path), { ...init, headers })
  const isJson = (resp.headers.get('content-type') || '').includes('application/json')
  const body: any = isJson ? await resp.json().catch(() => null) : await resp.text().catch(() => '')
  if (!resp.ok) {
    const msg = (body && typeof body === 'object' && body.error) || `HTTP ${resp.status}`
    throw new Error(msg)
  }
  return body as T
}

export const api = {
  get:  <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
}
