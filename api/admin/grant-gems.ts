// POST /api/admin/grant-gems
// Headers: x-admin-secret: <ADMIN_SECRET>
//          Authorization: Bearer <jwt>
// Body:    { gems?: number, hints?: number }
//
// ⚠️  TESTNET / DEVELOPMENT ONLY ⚠️
// Directly credits gems and/or hints to the authenticated wallet without
// going through GalaChain. Use this when the fee payer wallet is empty,
// testnet GALA is unavailable, or you need to fund a test wallet quickly.
//
// Both fields are optional — omit one to leave that balance unchanged.
// Defaults: gems=1000, hints=0 if body is empty.
//
// Protected by the same ADMIN_SECRET as reset-player so this endpoint
// can't be abused by players. Remove before mainnet.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { grantGems, grantHints } from '../_lib/economy.js'
import { getBalances } from '../_lib/round.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── Admin guard ──────────────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return res.status(500).json({ error: 'ADMIN_SECRET is not configured' })
  }
  if (req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(401).json({ error: 'Invalid or missing x-admin-secret header' })
  }

  // ── Wallet auth ──────────────────────────────────────────────────────────
  const address = await requireAuth(req.headers.authorization)
  if (!address) {
    return res.status(401).json({ error: 'Missing or invalid Authorization bearer token' })
  }

  // ── Parse amounts ────────────────────────────────────────────────────────
  const body  = (req.body ?? {}) as { gems?: unknown; hints?: unknown }
  const gems  = typeof body.gems  === 'number' && Number.isFinite(body.gems)  && body.gems  > 0 ? Math.floor(body.gems)  : 0
  const hints = typeof body.hints === 'number' && Number.isFinite(body.hints) && body.hints > 0 ? Math.floor(body.hints) : 0

  if (gems === 0 && hints === 0) {
    return res.status(400).json({ error: 'Provide at least one of: gems (number > 0), hints (number > 0)' })
  }

  // ── Grant ────────────────────────────────────────────────────────────────
  if (gems  > 0) await grantGems ({ address, amount: gems,  reason: 'admin_correction' })
  if (hints > 0) await grantHints({ address, amount: hints, reason: 'admin_correction' })

  const balances = await getBalances(address)

  console.log(`[admin/grant-gems] ${address} +${gems}g +${hints}h → ${balances.gems}g ${balances.hints}h`)

  return res.status(200).json({
    ok:         true,
    address,
    granted:    { gems, hints },
    newBalance: { gems: balances.gems, hints: balances.hints },
  })
}
