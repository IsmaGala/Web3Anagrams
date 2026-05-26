// POST /api/admin/reset-player
// Headers: x-admin-secret: <ADMIN_SECRET>
// Body:    { "address": "0x..." }
//
// ⚠️  TESTNET / DEVELOPMENT ONLY ⚠️
// Wipes ALL server-side data for a given wallet address so testers can
// start from a completely clean slate without spinning up a new wallet.
//
// Tables cleared (all keyed by `address`):
//   • player_state       — JSONB progress blob
//   • player_balances    — gems + hints balance
//   • balance_transactions — full audit/ownership log (skins, premium, events)
//   • scores             — leaderboard scores
//   • play_rounds        — server-authoritative round records
//   • profiles           — display name
//   • nonces             — login nonces (cleanup only, they expire anyway)
//
// Protection: caller must supply the ADMIN_SECRET env var value in the
// `x-admin-secret` header. Never ship this endpoint without that guard.
// For extra safety, set ADMIN_SECRET to a long random string and rotate it
// after testnet — or remove the endpoint entirely before mainnet.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── Auth guard ───────────────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return res.status(500).json({ error: 'ADMIN_SECRET is not configured on this deployment' })
  }
  const provided = req.headers['x-admin-secret']
  if (!provided || provided !== adminSecret) {
    return res.status(401).json({ error: 'Invalid or missing x-admin-secret header' })
  }

  // ── Resolve address ──────────────────────────────────────────────────────
  const { address: raw } = (req.body ?? {}) as { address?: string }
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ error: 'body.address is required' })
  }

  // Normalize: accept 0x… or eth|… formats; store as lowercase for the
  // DELETE WHERE clauses (the DB stores addresses in whatever case the
  // auth flow produced, so we do a case-insensitive match via LOWER()).
  const address = raw.trim()
  if (!address) {
    return res.status(400).json({ error: 'address must not be empty' })
  }

  const db = sql()

  try {
    // Use LOWER() on both sides so the wipe works regardless of whether the
    // address was stored as checksummed EIP-55, all-lower, or eth| prefixed.
    const [
      playerState,
      playerBalances,
      balanceTx,
      scores,
      playRounds,
      profiles,
      nonces,
    ] = await Promise.all([
      db`DELETE FROM player_state         WHERE LOWER(address) = LOWER(${address}) RETURNING address`,
      db`DELETE FROM player_balances       WHERE LOWER(address) = LOWER(${address}) RETURNING address`,
      db`DELETE FROM balance_transactions  WHERE LOWER(address) = LOWER(${address}) RETURNING id`,
      db`DELETE FROM scores                WHERE LOWER(address) = LOWER(${address}) RETURNING id`,
      db`DELETE FROM play_rounds           WHERE LOWER(address) = LOWER(${address}) RETURNING id`,
      db`DELETE FROM profiles              WHERE LOWER(address) = LOWER(${address}) RETURNING address`,
      db`DELETE FROM nonces                WHERE LOWER(address) = LOWER(${address}) RETURNING address`,
    ])

    const summary = {
      address,
      deleted: {
        player_state:        playerState.length,
        player_balances:     playerBalances.length,
        balance_transactions: balanceTx.length,
        scores:              scores.length,
        play_rounds:         playRounds.length,
        profiles:            profiles.length,
        nonces:              nonces.length,
      },
    }

    console.log('[admin/reset-player]', JSON.stringify(summary))
    return res.status(200).json({ ok: true, ...summary })

  } catch (e: any) {
    const msg = e?.message ?? String(e)
    console.error('[admin/reset-player] error:', msg)
    return res.status(500).json({ error: 'reset failed', detail: msg })
  }
}
