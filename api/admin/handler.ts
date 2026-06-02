// Community Manager Admin API
//
// All actions require: x-admin-secret: <ADMIN_SECRET> header.
//
// ── Actions ──────────────────────────────────────────────────────────────────
//
//  lookup-player      Body: { address }
//                     Returns balances, inventory, and recent transactions.
//
//  grant-gems         Body: { address, gems?, hints? }
//                     Credit gems and/or hints directly.
//
//  take-gems          Body: { address, gems?, hints? }
//                     Deduct gems and/or hints (admin_deduction reason).
//
//  grant-skin         Body: { address, skinId }
//                     Grant a cosmetic skin without charging gems.
//
//  unlock-world       Body: { address, worldId }
//                     Grant a premium world unlock without charging gems.
//
//  complete-level     Body: { address, worldId, levelIndex, score? }
//                     Insert a completed score record for the level.
//
//  recent-activity    Body: { address, limit? }
//                     Return last N balance_transactions rows (default 20).
//
//  reset-player       Body: { address }
//                     Wipe ALL server rows for a wallet.

import type { VercelRequest, VercelResponse } from '../_lib/vercel-compat.js'
import { sql }              from '../_lib/db.js'
import { applyCors }        from '../_lib/cors.js'
import { getBalances }      from '../_lib/round.js'
import { getInventory }     from '../_lib/inventory.js'
import {
  grantGems,
  grantHints,
  spendGems,
  spendHints,
  grantSkin,
  grantWorldUnlock,
} from '../_lib/economy.js'

// ── Auth guard ────────────────────────────────────────────────────────────────

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

function requireAddress(body: Record<string, unknown>, res: VercelResponse): string | null {
  const raw = body.address
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    res.status(400).json({ error: 'body.address is required' })
    return null
  }
  return raw.trim().toLowerCase()
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!checkAdminSecret(req, res)) return

  // action comes from the Express route param (/api/admin/:action)
  const action = (req.params as Record<string, string>)['action'] ?? (req.query['action'] as string)
  const body   = (req.body ?? {}) as Record<string, unknown>
  const db     = sql()

  // ── lookup-player ──────────────────────────────────────────────────────────

  if (action === 'lookup-player') {
    const address = requireAddress(body, res)
    if (!address) return

    const [balances, inventory, txRows, stateRows] = await Promise.all([
      getBalances(address),
      getInventory(address),
      db`
        SELECT id, gems_delta, hints_delta, reason, metadata, created_at
          FROM balance_transactions
         WHERE LOWER(address) = ${address}
         ORDER BY created_at DESC
         LIMIT 10
      ` as Promise<Array<Record<string, unknown>>>,
      db`
        SELECT updated_at FROM player_state WHERE LOWER(address) = ${address} LIMIT 1
      ` as Promise<Array<{ updated_at: string | Date }>>,
    ])

    return res.status(200).json({
      ok: true,
      address,
      balances,
      inventory,
      recentTransactions: txRows,
      lastSyncedAt: stateRows[0]?.updated_at ?? null,
    })
  }

  // ── grant-gems ────────────────────────────────────────────────────────────

  if (action === 'grant-gems') {
    const address = requireAddress(body, res)
    if (!address) return

    const gems  = typeof body.gems  === 'number' && body.gems  > 0 ? Math.floor(body.gems)  : 0
    const hints = typeof body.hints === 'number' && body.hints > 0 ? Math.floor(body.hints) : 0
    if (gems === 0 && hints === 0) {
      return res.status(400).json({ error: 'Provide at least one of: gems (number > 0), hints (number > 0)' })
    }

    if (gems  > 0) await grantGems ({ address, amount: gems,  reason: 'admin_correction' })
    if (hints > 0) await grantHints({ address, amount: hints, reason: 'admin_correction' })

    const balances = await getBalances(address)
    console.log(`[admin/grant-gems] ${address} +${gems}g +${hints}h → ${balances.gems}g ${balances.hints}h`)
    return res.status(200).json({ ok: true, address, granted: { gems, hints }, newBalance: balances })
  }

  // ── take-gems ─────────────────────────────────────────────────────────────

  if (action === 'take-gems') {
    const address = requireAddress(body, res)
    if (!address) return

    const gems  = typeof body.gems  === 'number' && body.gems  > 0 ? Math.floor(body.gems)  : 0
    const hints = typeof body.hints === 'number' && body.hints > 0 ? Math.floor(body.hints) : 0
    if (gems === 0 && hints === 0) {
      return res.status(400).json({ error: 'Provide at least one of: gems (number > 0), hints (number > 0)' })
    }

    const results: Record<string, unknown> = {}
    if (gems  > 0) results.gems  = await spendGems ({ address, amount: gems,  reason: 'admin_deduction', metadata: { by: 'admin' } })
    if (hints > 0) results.hints = await spendHints({ address, amount: hints, reason: 'admin_deduction', metadata: { by: 'admin' } })

    const balances = await getBalances(address)
    console.log(`[admin/take-gems] ${address} -${gems}g -${hints}h → ${balances.gems}g ${balances.hints}h`)
    return res.status(200).json({ ok: true, address, deducted: { gems, hints }, results, newBalance: balances })
  }

  // ── grant-skin ────────────────────────────────────────────────────────────

  if (action === 'grant-skin') {
    const address = requireAddress(body, res)
    if (!address) return

    const skinId = typeof body.skinId === 'string' ? body.skinId.trim() : ''
    if (!skinId) return res.status(400).json({ error: 'body.skinId is required' })

    const result    = await grantSkin({ address, skinId, reason: 'cosmetic_skin', metadata: { source: 'admin_grant' } })
    const inventory = await getInventory(address)
    console.log(`[admin/grant-skin] ${address} skin=${skinId} ok=${result.ok}`)
    return res.status(200).json({ ok: true, address, ...result, inventory })
  }

  // ── unlock-world ──────────────────────────────────────────────────────────

  if (action === 'unlock-world') {
    const address = requireAddress(body, res)
    if (!address) return

    const worldId = typeof body.worldId === 'string' ? body.worldId.trim() : ''
    if (!worldId) return res.status(400).json({ error: 'body.worldId is required' })

    const result    = await grantWorldUnlock({ address, worldId, metadata: { source: 'admin_grant' } })
    const inventory = await getInventory(address)
    console.log(`[admin/unlock-world] ${address} world=${worldId} ok=${result.ok}`)
    return res.status(200).json({ ok: true, address, ...result, inventory })
  }

  // ── complete-level ────────────────────────────────────────────────────────
  // Inserts or updates a score row. event_id = worldId, week_id = levelIndex.

  if (action === 'complete-level') {
    const address = requireAddress(body, res)
    if (!address) return

    const worldId    = typeof body.worldId    === 'string' ? body.worldId.trim()         : ''
    const levelIndex = typeof body.levelIndex === 'number' ? Math.floor(body.levelIndex) : -1
    const score      = typeof body.score      === 'number' ? Math.max(0, Math.floor(body.score)) : 100

    if (!worldId)       return res.status(400).json({ error: 'body.worldId is required' })
    if (levelIndex < 0) return res.status(400).json({ error: 'body.levelIndex must be a non-negative integer' })

    await db`
      INSERT INTO scores (address, event_id, week_id, score)
      VALUES (${address}, ${worldId}, ${levelIndex}, ${score})
      ON CONFLICT (address, event_id, week_id) DO UPDATE
        SET score      = GREATEST(scores.score, EXCLUDED.score),
            updated_at = NOW()
    `
    console.log(`[admin/complete-level] ${address} ${worldId}[${levelIndex}] score=${score}`)
    return res.status(200).json({ ok: true, address, worldId, levelIndex, score })
  }

  // ── recent-activity ───────────────────────────────────────────────────────

  if (action === 'recent-activity') {
    const address = requireAddress(body, res)
    if (!address) return

    const limit = typeof body.limit === 'number'
      ? Math.min(Math.max(1, Math.floor(body.limit)), 100)
      : 20

    const rows = await db`
      SELECT id, gems_delta, hints_delta, reason, metadata, created_at
        FROM balance_transactions
       WHERE LOWER(address) = ${address}
       ORDER BY created_at DESC
       LIMIT ${limit}
    ` as Array<Record<string, unknown>>

    return res.status(200).json({ ok: true, address, transactions: rows, count: rows.length })
  }

  // ── reset-player ──────────────────────────────────────────────────────────

  if (action === 'reset-player') {
    const raw = body.address
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ error: 'body.address is required' })
    }
    const address = raw.trim()

    try {
      const [playerState, playerBalances, balanceTx, scoreRows, playRounds, profiles, nonces] =
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
          scores:               scoreRows.length,
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

  return res.status(404).json({
    error: `Unknown admin action: "${action}". Valid: lookup-player, grant-gems, take-gems, grant-skin, unlock-world, complete-level, recent-activity, reset-player`,
  })
}
