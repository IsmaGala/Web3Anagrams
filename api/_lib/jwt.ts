// JWT sign + verify, using HS256 via `jose`. The same secret is read on every
// invocation; rotating it invalidates every active session.

import { SignJWT, jwtVerify } from 'jose'

export interface SessionClaims {
  sub:     string   // 0x-lowercased wallet address
  iat?:    number
  exp?:    number
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is not set — generate with `openssl rand -base64 48` and add to Vercel env vars')
  return new TextEncoder().encode(s)
}

function ttlSeconds(): number {
  const raw = process.env.JWT_TTL_SECONDS
  const n = raw ? parseInt(raw, 10) : 86400
  return Number.isFinite(n) && n > 0 ? n : 86400
}

export async function signSession(address: string): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(address.toLowerCase())
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds())
    .sign(secret())
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string') return null
    return { sub: payload.sub, iat: payload.iat, exp: payload.exp }
  } catch {
    return null
  }
}

/** Read the bearer token from an Authorization header, validate, return the
 *  address — or null when missing/invalid. */
export async function requireAuth(authHeader: string | undefined | null): Promise<string | null> {
  if (!authHeader) return null
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  if (!m) return null
  const claims = await verifySession(m[1])
  return claims?.sub ?? null
}
