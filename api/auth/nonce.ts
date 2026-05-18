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
import { parseWalletAddress } from '../_lib/wallet.js'

const TTL_MS = 5 * 60 * 1000   // 5 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Accept all four address formats (0x, eth|, client|, bare hex) — see
  // api/_lib/wallet.ts. Was a strict /^0x[a-f0-9]{40}$/i which the doc
  // explicitly flags as the "Failed to fetch nonce" footgun.
  const { address } = (req.body ?? {}) as { address?: string }
  let parsed
  try {
    parsed = parseWalletAddress(address)
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? 'Invalid address' })
  }
  // The nonce-recovery path uses ethers.verifyMessage which only produces
  // ETH addresses. A client|<id> login would require GalaChain
  // /GetPublicKey lookup (doc §4) — out of scope until we wire chain calls.
  if (parsed.kind !== 'eth') {
    return res.status(400).json({ error: 'client|<id> login not yet supported — pass the underlying 0x address' })
  }
  const key = parsed.stored
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
