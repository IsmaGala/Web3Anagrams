// POST /api/auth/verify
// Body: { address: "0x…", signature: "0x…" }
// Returns: { jwt, address, expiresIn }
//
// Verification flow:
//   1. Look up the stored nonce for `address`. If absent or expired → 400.
//   2. ethers.verifyMessage recovers the signer from (nonce, signature).
//   3. Recovered address must equal the request address (case-insensitive).
//   4. Delete the nonce row — one-time use.
//   5. Sign a JWT with `sub = lowercased address`.
//
// Reference: docs/wallet/WALLET_AUTH.md §5

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyMessage } from 'ethers'
import { sql } from '../_lib/db'
import { applyCors } from '../_lib/cors'
import { signSession } from '../_lib/jwt'

function isHexAddress(s: unknown): s is string {
  return typeof s === 'string' && /^0x[a-fA-F0-9]{40}$/.test(s)
}
function isHex(s: unknown): s is string {
  return typeof s === 'string' && /^0x[a-fA-F0-9]+$/.test(s)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { address, signature } = (req.body ?? {}) as { address?: string; signature?: string }
  if (!isHexAddress(address) || !isHex(signature)) {
    return res.status(400).json({ error: 'address and signature must be 0x-prefixed hex' })
  }

  const key = address.toLowerCase()
  const db  = sql()

  // 1. Fetch the active nonce row.
  const rows = await db`
    SELECT nonce, expires_at FROM nonces WHERE address = ${key} LIMIT 1
  ` as Array<{ nonce: string; expires_at: string }>

  if (rows.length === 0) {
    return res.status(400).json({ error: 'No active nonce — request one from /api/auth/nonce first' })
  }
  const { nonce, expires_at } = rows[0]
  if (new Date(expires_at).getTime() < Date.now()) {
    await db`DELETE FROM nonces WHERE address = ${key}`
    return res.status(400).json({ error: 'Nonce expired — request a new one' })
  }

  // 2-3. Recover signer & compare.
  let recovered: string
  try {
    recovered = verifyMessage(nonce, signature).toLowerCase()
  } catch (e: any) {
    return res.status(400).json({ error: 'Signature could not be recovered: ' + (e?.message ?? 'unknown') })
  }
  if (recovered !== key) {
    return res.status(401).json({ error: 'Signature does not match the requesting address' })
  }

  // 4. One-time use — delete before issuing the JWT.
  await db`DELETE FROM nonces WHERE address = ${key}`

  // 5. Mint session.
  const jwt = await signSession(key)
  const ttl = parseInt(process.env.JWT_TTL_SECONDS ?? '86400', 10)

  return res.status(200).json({ jwt, address: key, expiresIn: ttl })
}
