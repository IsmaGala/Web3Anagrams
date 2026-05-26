// GET /api/profile
// Headers: Authorization: Bearer <jwt>
// Returns: {
//   address, payload, updatedAt, balances, inventory,
//   firstWalletBonusGranted?,
// }
//
// • address    — the JWT-verified wallet
// • payload    — the JSONB blob the client uploaded most recently, or null
//                if this wallet has never synced. Owns level scores and
//                completion flags; ownership of skins/premium/event entries
//                no longer lives here (see `inventory`).
// • updatedAt  — ISO timestamp of the last sync, or null
// • balances   — authoritative gem + hint balance from player_balances
// • inventory  — authoritative ownership derived from balance_transactions:
//                { ownedSkins, unlockedPremium, eventUnlocks }. The client
//                should trust these over anything in `payload`.
// • firstWalletBonusGranted — present only on the first profile pull ever
//                for this wallet. Server granted the welcome bundle inside
//                that same call; `balances` already reflects it.
//
// First-wallet bonus (since v5): used to be client-issued in App.tsx, which
// meant a cheater could keep flipping `firstWalletBonusClaimed` in
// localStorage and minting +15 gems / +5 hints on every reload. Now it's
// server-issued exactly once per (address), with the audit row in
// balance_transactions as the dedup guard.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { applyCors } from './_lib/cors.js'
import { requireAuth } from './_lib/jwt.js'
import { getBalances } from './_lib/round.js'
import { grantGems, grantHints, hasReceivedGrant } from './_lib/economy.js'
import { getInventory } from './_lib/inventory.js'
import { FIRST_WALLET_BONUS } from './_data/worldsServerData.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Diagnostic guards.
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

  try {
    // ── First-wallet welcome bundle ────────────────────────────────────────
    // Granted exactly once per address. The audit log is the source of truth
    // for "did this wallet receive the bonus" — no separate flag column.
    let firstWalletBonusGranted: { gems: number; hints: number } | undefined
    const alreadyBonused = await hasReceivedGrant({
      address, reason: 'first_wallet_bonus',
    })
    if (!alreadyBonused) {
      await grantGems({
        address, amount: FIRST_WALLET_BONUS.gems, reason: 'first_wallet_bonus',
      })
      await grantHints({
        address, amount: FIRST_WALLET_BONUS.hints, reason: 'first_wallet_bonus',
      })
      firstWalletBonusGranted = {
        gems:  FIRST_WALLET_BONUS.gems,
        hints: FIRST_WALLET_BONUS.hints,
      }
    }

    // ── Profile JSONB (still client-owned schema) ──────────────────────────
    const rows = await sql()`
      SELECT payload, updated_at FROM player_state WHERE address = ${address} LIMIT 1
    ` as Array<{ payload: unknown; updated_at: string | Date }>

    const row = rows[0]
    const updatedAt = row?.updated_at
      ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at)
      : null

    // ── Authoritative balances + inventory ─────────────────────────────────
    // Both come straight from server-side tables. balances from
    // player_balances; inventory derived from balance_transactions metadata.
    // Reflects any grant we just made in the bonus branch above.
    const balances  = await getBalances(address)
    const inventory = await getInventory(address)

    return res.status(200).json({
      address,
      payload:   row?.payload ?? null,
      updatedAt,
      balances,
      inventory,
      firstWalletBonusGranted,
    })
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    const code = e?.code ?? e?.name ?? 'UNKNOWN'
    return res.status(500).json({
      error:  'profile handler threw',
      detail: msg,
      code,
    })
  }
}
