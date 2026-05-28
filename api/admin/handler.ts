// POST /api/admin/reset-player  →  action = "reset-player"
// POST /api/admin/grant-gems    →  action = "grant-gems"
//
// ⚠️  TESTNET / DEVELOPMENT ONLY ⚠️
// All routes require x-admin-secret: <ADMIN_SECRET> header.
// Remove or gate behind an env flag before mainnet.
//
// reset-player — wipes ALL server rows for a wallet address so testers
//   start from a clean slate. Body: { address: "0x..." }
//
// grant-gems — credits gems/hints directly, bypassing GalaChain. Use
//   when the fee payer wallet is empty or testnet GALA is unavailable.
//   Requires Authorization: Bearer <jwt> in addition to the admin secret.
//   Body: { gems?: number, hints?: number }

import type { VercelRequest, VercelResponse } from '../_lib/vercel-compat.js'
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { grantGems, grantHints } from '../_lib/economy.js'
import { getBalances } from '../_lib/round.js'

// ── Shared admin auth guard ──────────────────────────────────────────────────
function checkAdminSecret(req: VercelRequest, res: VercelResponse): boolean {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    res.status(500).json({ error: 'ADMIN_SECRET is not configured on this deployment' })
    return false
  }
  if (req.headers['x-admin-secret'] !== adminSecret) {
    res.status(401).json({ error: 'Invalid or missing x-admin-secret header' })
    return false
  }
  return true
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!checkAdminSecret(req, res)) return

  const action = req.query['action']

  // ── reset-player ──────────────────────────────────────────────────────────
  if (action === 'reset-player') {
    const { address: raw } = (req.body ?? {}) as { address?: string }
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ error: 'body.address is required' })
    }
    const address = raw.trim()
    const db = sql()
    try {
      const [playerState, playerBalances, balanceTx, scores, playRounds, profiles, nonces] =
        await Promise.all([
          db`DELETE FROM player_state        WHERE LOWER(address) = LOWER(${address}) RETURNING address` as Promise<Array<Record<string,unknown>>>,
          db`DELETE FROM player_balances      WHERE LOWER(address) = LOWER(${address}) RETURNING address` as Promise<Array<Record<string,unknown>>>,
          db`DELETE FROM balance_transactions WHERE LOWER(address) = LOWER(${address}) RETURNING id`     as Promise<Array<Record<string,unknown>>>,
          db`DELETE FROM scores               WHERE LOWER(address) = LOWER(${address}) RETURNING id`     as Promise<Array<Record<string,unknown>>>,
          db`DELETE FROM play_rounds          WHERE LOWER(address) = LOWER(${address}) RETURNING id`     as Promise<Array<Record<string,unknown>>>,
          db`DELETE FROM profiles             WHERE LOWER(address) = LOWER(${address}) RETURNING address` as Promise<Array<Record<string,unknown>>>,
          db`DELETE FROM nonces               WHERE LOWER(address) = LOWER(${address}) RETURNING address` as Promise<Array<Record<string,unknown>>>,
        ])
      const summary = {
        address,
        deleted: {
          player_state:         playerState.length,
          player_balances:      playerBalances.length,
          balance_transactions: balanceTx.length,
          scores:               scores.length,
          play_rounds:          playRounds.length,
          profiles:             profiles.length,
          nonces:               nonces.length,
        },
      }
      console.log('[admin/reset-player]', JSON.stringify(summary))
      return res.status(200).json({ ok: true, ...summary })
    } catch (e: any) {
      console.error('[admin/reset-player] error:', e?.message)
      return res.status(500).json({ error: 'reset failed', detail: e?.message ?? String(e) })
    }
  }

  // ── grant-gems ────────────────────────────────────────────────────────────
  if (action === 'grant-gems') {
    const address = await requireAuth(req.headers.authorization)
    if (!address) {
      return res.status(401).json({ error: 'Missing or invalid Authorization bearer token' })
    }
    const body  = (req.body ?? {}) as { gems?: unknown; hints?: unknown }
    const gems  = typeof body.gems  === 'number' && body.gems  > 0 ? Math.floor(body.gems)  : 0
    const hints = typeof body.hints === 'number' && body.hints > 0 ? Math.floor(body.hints) : 0
    if (gems === 0 && hints === 0) {
      return res.status(400).json({ error: 'Provide at least one of: gems (number > 0), hints (number > 0)' })
    }
    if (gems  > 0) await grantGems ({ address, amount: gems,  reason: 'admin_correction' })
    if (hints > 0) await grantHints({ address, amount: hints, reason: 'admin_correction' })
    const balances = await getBalances(address)
    console.log(`[admin/grant-gems] ${address} +${gems}g +${hints}h → ${balances.gems}g ${balances.hints}h`)
    return res.status(200).json({
      ok: true, address,
      granted:    { gems, hints },
      newBalance: { gems: balances.gems, hints: balances.hints },
    })
  }

  return res.status(404).json({ error: `Unknown admin action: ${action}. Valid: reset-player, grant-gems` })
}
