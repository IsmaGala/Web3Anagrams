// Single Vercel function handling both auth routes to stay within the Hobby
// plan's 12-function limit.
//
//   POST /api/auth/nonce   — issue a sign-in nonce
//   POST /api/auth/verify  — verify signature, mint JWT

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'crypto'
import { verifyMessage, keccak256, recoverAddress } from 'ethers'
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'
import { signSession } from '../_lib/jwt.js'
import { parseWalletAddress } from '../_lib/wallet.js'
import { track } from '../_lib/analytics.js'

const TTL_MS = 5 * 60 * 1000

function isHex(s: unknown): s is string {
  return typeof s === 'string' && /^0x[a-fA-F0-9]+$/.test(s)
}

function action(req: VercelRequest): string {
  const a = req.query['action']
  return (Array.isArray(a) ? a[0] : (a ?? '')).toLowerCase()
}

// ── POST /api/auth/nonce ──────────────────────────────────────────────────────

async function handleNonce(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { address } = (req.body ?? {}) as { address?: string }
  let parsed
  try {
    parsed = parseWalletAddress(address)
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? 'Invalid address' })
  }
  if (parsed.kind !== 'eth') {
    return res.status(400).json({ error: 'client|<id> login is not yet supported on this endpoint' })
  }

  const nonce = `NFT WordChain login\nnonce: ${randomBytes(16).toString('hex')}`
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()

  await sql()`
    INSERT INTO nonces (address, nonce, expires_at)
    VALUES (${parsed.stored}, ${nonce}, ${expiresAt})
    ON CONFLICT (address) DO UPDATE
      SET nonce      = EXCLUDED.nonce,
          expires_at = EXCLUDED.expires_at
  `

  return res.status(200).json({ nonce, expiresAt })
}

// ── POST /api/auth/verify ─────────────────────────────────────────────────────

/** Recover signer from nonce + signature — tries all personal_sign variants. */
function recoverAll(nonce: string, signature: string): string[] {
  const out: string[] = []
  const hex = '0x' + Buffer.from(nonce, 'utf8').toString('hex')
  try { out.push(verifyMessage(nonce, signature).toLowerCase()) } catch {}
  try { out.push(verifyMessage(hex, signature).toLowerCase()) } catch {}
  try { out.push(recoverAddress(keccak256(hex), signature).toLowerCase()) } catch {}
  return out
}

async function handleVerify(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { address, signature } = (req.body ?? {}) as { address?: string; signature?: string }
  if (!isHex(signature)) {
    return res.status(400).json({ error: 'signature must be 0x-prefixed hex' })
  }
  let parsed
  try {
    parsed = parseWalletAddress(address)
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? 'Invalid address' })
  }
  if (parsed.kind !== 'eth') {
    return res.status(400).json({ error: 'client|<id> verification is not yet supported on this endpoint' })
  }

  const rows = await sql()`
    SELECT nonce, expires_at FROM nonces WHERE address = ${parsed.stored} LIMIT 1
  ` as Array<{ nonce: string; expires_at: string | Date }>
  if (rows.length === 0) {
    return res.status(400).json({ error: 'No nonce on file — request /api/auth/nonce first' })
  }
  const { nonce } = rows[0]
  const expiresMs = rows[0].expires_at instanceof Date
    ? rows[0].expires_at.getTime()
    : Date.parse(rows[0].expires_at)
  if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) {
    try { await sql()`DELETE FROM nonces WHERE address = ${parsed.stored}` } catch {}
    return res.status(400).json({ error: 'Nonce expired — request a new one' })
  }

  const recovered = recoverAll(nonce, signature)
  const expected  = parsed.stored.toLowerCase()
  if (!recovered.includes(expected)) {
    return res.status(401).json({ error: 'Signature did not recover the expected address' })
  }

  await sql()`DELETE FROM nonces WHERE address = ${parsed.stored}`

  const jwt = await signSession(parsed.stored)
  const ttl = parseInt(process.env.JWT_TTL_SECONDS ?? '86400', 10)

  let firstTime = false
  try {
    const prior = await sql()`
      SELECT 1 FROM play_rounds WHERE address = ${parsed.stored} LIMIT 1
    ` as Array<unknown>
    firstTime = prior.length === 0
  } catch {}

  track('wallet_connected', {
    address:    parsed.stored,
    method:     parsed.kind === 'eth' ? 'metamask_or_gala' : parsed.kind,
    first_time: firstTime,
  })

  return res.status(200).json({
    jwt,
    address:   parsed.stored,
    expiresIn: Number.isFinite(ttl) && ttl > 0 ? ttl : 86400,
  })
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  switch (action(req)) {
    case 'nonce':  return handleNonce(req, res)
    case 'verify': return handleVerify(req, res)
    default:
      return res.status(404).json({ error: `Unknown auth action: ${action(req)}` })
  }
}
