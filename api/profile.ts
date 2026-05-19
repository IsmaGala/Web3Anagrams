// GET /api/profile
// Headers: Authorization: Bearer <jwt>
// Returns: { address, payload, updatedAt, balances, firstWalletBonusGranted? }
//
// • address    — the JWT-verified wallet
// • payload    — the JSONB blob the client uploaded most recently, or null
//                if this wallet has never synced
// • updatedAt  — ISO timestamp of the last sync, or null
// • balances   — authoritative gem + hint balance from player_balances
// • firstWalletBonusGranted — when this is the wallet's first profile pull
//                ever, the server grants the welcome bundle (gems + hints)
//                and includes the granted amounts here. Subsequent calls
//                omit the field.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { applyCors } from './_lib/cors.js'
import { requireAuth } from './_lib/jwt.js'
import { getBalances } from './_lib/round.js'
import { grantGems, grantHints, hasReceivedGrant } from './_lib/economy.js'
import { FIRST_WALLET_BONUS } from './_data/worldsServerData.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── Diagnostic guard ─────────────────────────────────────────────────────
  // Surface specific config errors instead of letting them collapse into
  // Vercel's generic FUNCTION_INVOCATION_FAILED. The two env vars below are
  // the most common deploy-time misses.
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

  // Wrap the entire DB-touching section so any thrown error (missing table,
  // SQL syntax mismatch, connection failure, etc.) comes back as a real
  // 500-with-message rather than FUNCTION_INVOCATION_FAILED.
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

    // ── Authoritative balances ─────────────────────────────────────────────
    const balances = await getBalances(address)

    return res.status(200).json({
      address,
      payload:   row?.payload ?? null,
      updatedAt,
      balances,
      firstWalletBonusGranted,
    })
  } catch (e: any) {
    // Surface the real error so we can see WHY in the browser network panel
    // instead of getting Vercel's opaque FUNCTION_INVOCATION_FAILED.
    const msg = e?.message ?? String(e)
    const code = e?.code ?? e?.name ?? 'UNKNOWN'
    return res.status(500).json({
      error:  'profile handler threw',
      detail: msg,
      code,
    })
  }
}
