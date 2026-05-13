// POST /api/auth/nonce
// Body: { address: "0x…" }
// Returns: { nonce, expiresAt }
//
// Issues a single-use random nonce keyed by the requesting wallet address.
// The client signs this nonce with personal_sign and posts the result to
// /api/auth/verify to redeem a JWT.
//
// TTL: 5 minutes. UPSERT so a second request from the same address simply
// rotates the nonce — no rate-limiting beyond what Vercel/Neon enforce.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'

const TTL_MS = 5 * 60 * 1000   // 5 minutes

function isHexAddress(s: unknown): s is string {
  return typeof s === 'string' && /^0x[a-fA-F0-9]{40}$/.test(s)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { address } = (req.body ?? {}) as { address?: string }
  if (!isHexAddress(address)) {
    return res.status(400).json({ error: 'Invalid address — expected 0x-prefixed 40-char hex' })
  }
  const key   = address.toLowerCase()
  const nonce = `wordchain-login: ${crypto.randomUUID()}`
  const expiresAt = new Date(Date.now() + TTL_MS)

  const db = sql()
  await db`
    INSERT INTO nonces (address, nonce, expires_at)
    VALUES (${key}, ${nonce}, ${expiresAt.toISOString()})
    ON CONFLICT (address) DO UPDATE
      SET nonce = EXCLUDED.nonce,
          expires_at = EXCLUDED.expires_at
  `

  return res.status(200).json({ nonce, expiresAt: expiresAt.toISOString() })
}
