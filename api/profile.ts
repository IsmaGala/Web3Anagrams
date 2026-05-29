// GET  /api/profile       — pull profile, balances, inventory
// POST /api/profile       — sync (upsert) player state payload
//                           (previously /api/profile/sync)
//
// Both routes require Authorization: Bearer <jwt>.
//
// GET returns:
//   { address, payload, updatedAt, balances, inventory, firstWalletBonusGranted? }
//
// POST body: full PlayerStatePayload. Returns: { ok, address, updatedAt }
//   Economy fields in the payload are overwritten with authoritative values
//   from player_balances before persisting — tampered balances are ignored.

import type { VercelRequest, VercelResponse } from './_lib/vercel-compat.js'
import { sql } from './_lib/db.js'
import { applyCors } from './_lib/cors.js'
import { requireAuth } from './_lib/jwt.js'
import { getBalances } from './_lib/round.js'
import { grantGems, grantHints, hasReceivedGrant } from './_lib/economy.js'
import { getInventory } from './_lib/inventory.js'
import { FIRST_WALLET_BONUS } from './_data/worldsServerData.js'

const MAX_PAYLOAD_BYTES = 200_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL is not configured on this deployment' })
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'JWT_SECRET is not configured on this deployment' })
  }

  const address = await requireAuth(req.headers.authorization)
  if (!address) {
    return res.status(401).json({ error: 'Missing or invalid Authorization bearer token' })
  }

  // ── POST: sync payload ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const payload = req.body
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'payload must be a JSON object' })
    }

    const sanitized: Record<string, unknown> = { ...payload }
    if (sanitized.economy && typeof sanitized.economy === 'object' && !Array.isArray(sanitized.economy)) {
      const balRows = await sql()`
        SELECT gems_balance, hints_balance FROM player_balances WHERE address = ${address}
      ` as Array<{ gems_balance: number; hints_balance: number }>
      const bal = balRows[0] ?? { gems_balance: 0, hints_balance: 0 }
      sanitized.economy = {
        ...(sanitized.economy as object),
        gemsBalance: bal.gems_balance,
        hints:       bal.hints_balance,
      }
      delete (sanitized.economy as Record<string, unknown>).galaBalance
    }

    const serialized = JSON.stringify(sanitized)
    if (serialized.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes` })
    }

    const now = new Date().toISOString()
    await sql()`
      INSERT INTO player_state (address, payload, updated_at)
      VALUES (${address}, ${sql().json(sanitized)}, ${now})
      ON CONFLICT (address) DO UPDATE
        SET payload    = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
    `
    return res.status(200).json({ ok: true, address, updatedAt: now })
  }

  // ── GET: pull profile ────────────────────────────────────────────────────
  try {
    // First-wallet welcome bundle — granted exactly once per address.
    let firstWalletBonusGranted: { gems: number; hints: number } | undefined
    const alreadyBonused = await hasReceivedGrant({ address, reason: 'first_wallet_bonus' })
    if (!alreadyBonused) {
      await grantGems ({ address, amount: FIRST_WALLET_BONUS.gems,  reason: 'first_wallet_bonus' })
      await grantHints({ address, amount: FIRST_WALLET_BONUS.hints, reason: 'first_wallet_bonus' })
      firstWalletBonusGranted = { gems: FIRST_WALLET_BONUS.gems, hints: FIRST_WALLET_BONUS.hints }
    }

    const rows = await sql()`
      SELECT payload, updated_at FROM player_state WHERE address = ${address} LIMIT 1
    ` as Array<{ payload: unknown; updated_at: string | Date }>

    const row       = rows[0]
    const updatedAt = row?.updated_at
      ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at)
      : null

    const balances  = await getBalances(address)
    const inventory = await getInventory(address)

    return res.status(200).json({
      address, payload: row?.payload ?? null,
      updatedAt, balances, inventory, firstWalletBonusGranted,
    })
  } catch (e: any) {
    console.error('[profile] unhandled error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
