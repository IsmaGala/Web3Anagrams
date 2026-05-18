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
import { verifyMessage, keccak256, recoverAddress } from 'ethers'
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'
import { signSession } from '../_lib/jwt.js'
import { parseWalletAddress } from '../_lib/wallet.js'

function isHex(s: unknown): s is string {
  return typeof s === 'string' && /^0x[a-fA-F0-9]+$/.test(s)
}

/** Recover the signer's address from a nonce + signature using every
 *  personal_sign variant we've seen in the wild. MetaMask uses standard
 *  EIP-191 over the raw message; Gala Wallet hex-encodes the message bytes
 *  first; older GalaChain chaincode tooling drops EIP-191 and just keccaks
 *  the hex form. We accept whichever recovers an address that matches the
 *  nonce-requester — they all require the same private key, so trying them
 *  in series does not expose us to forgery. Reference: WALLET_AUTH.md §10 #2.
 */
function recoverAll(nonce: string, signature: string): string[] {
  const out: string[] = []
  const hex = '0x' + Buffer.from(nonce, 'utf8').toString('hex')

  // 1. Standard EIP-191 — MetaMask, modern Gala Wallet.
  try { out.push(verifyMessage(nonce, signature).toLowerCase()) } catch {}

  // 2. EIP-191 over the hex-encoded message — Gala Wallet caveat #2.
  try { out.push(verifyMessage(hex, signature).toLowerCase()) } catch {}

  // 3. Raw keccak256 of "0x" + hex(msg) — legacy GalaChain chaincode style.
  try { out.push(recoverAddress(keccak256(hex), signature).toLowerCase()) } catch {}

  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { address, signature } = (req.body ?? {}) as { address?: string; signature?: string }
  if (!isHex(signature)) {
    return res.status(400).json({ error: 'signature must be 0x-prefixed hex' })
  }
  // Same parser as /auth/nonce — accept any of the four formats. Only the
  // eth-kind branch can be signature-verified locally (client|<id> needs a
  // GalaChain pubkey lookup; see doc §4).
  let parsed
  try {
    parsed = parseWalletAddress(address)
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? 'Invalid address' })
  }
  if (parsed.kind !== 'eth') {
    return res.status(400).json({ error: 'client|<id> login not yet supported — pass the underlying 0x address' })
  }
  const key = parsed.stored
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

  // 2-3. Recover signer & compare — try all known personal_sign variants.
  // (MetaMask, modern Gala Wallet, legacy chaincode hash.) Accept if any
  // variant recovers the requesting address; otherwise reject.
  const recovered = recoverAll(nonce, signature)
  if (recovered.length === 0) {
    return res.status(400).json({ error: 'Signature could not be recovered' })
  }
  if (!recovered.includes(key)) {
    return res.status(401).json({ error: 'Signature does not match the requesting address' })
  }

  // 4. One-time use — delete before issuing the JWT.
  await db`DELETE FROM nonces WHERE address = ${key}`

  // 5. Mint session.
  const jwt = await signSession(key)
  const ttl = parseInt(process.env.JWT_TTL_SECONDS ?? '86400', 10)

  return res.status(200).json({ jwt, address: key, expiresIn: ttl })
}
