// Minimal CORS helper. Frontend and backend share an origin on Vercel, so
// in production no CORS headers are needed. But local dev (vite on :5173
// hitting vercel dev on :3000) and any future external clients need this.

import type { VercelRequest, VercelResponse } from '@vercel/node'

const DEFAULT_LOCAL_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
])

function allowedOrigins(): Set<string> {
  const env = process.env.ALLOWED_ORIGINS
  if (!env) return DEFAULT_LOCAL_ORIGINS
  return new Set(env.split(',').map(s => s.trim()).filter(Boolean))
}

export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  // Short-circuit preflight requests.
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}
