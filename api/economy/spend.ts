// POST /api/economy/spend
// Body:    { amount: number, reason: SpendReason, metadata?: object }
// Headers: Authorization: Bearer <jwt>
// Returns:
//   ok:    200 { ok: true,  newBalance, reason }
//   broke: 402 { ok: false, newBalance, reason: 'insufficient' }
//
// This is the ONLY way the client can deduct gems. Every spend site —
// hint pack purchase, premium world unlock, weekly event, daily retry,
// cosmetic skin — POSTs here. The server is authoritative: if the player
// edits localStorage to show 99999 gems, the server still rejects spends
// they can't actually afford.
//
// The endpoint does NOT perform the side effect of the spend (e.g.,
// flipping `unlockedPremium[worldId] = true`) — the client does that
// after a successful response. Those unlock flags are still client-side
// localStorage in this milestone; moving them server-side is the next
// milestone. The cheat-prevention for THIS milestone is purely about
// gem balance: the player can't generate gems out of nothing.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { spendGems, grantHints, type SpendReason } from '../_lib/economy.js'

// In-game hint pack catalog — keep in sync with PACKS in
// src/components/ShopModal.tsx. Server is authoritative on pricing; the
// client passes packId in metadata and the server looks up cost + hints
// from this table, ignoring whatever the client tried to claim.
const HINT_PACK_CATALOG: Record<string, { gems: number; hints: number }> = {
  starter: { gems: 100,  hints: 5   },
  pro:     { gems: 400,  hints: 25  },
  whale:   { gems: 1000, hints: 100 },
}

const VALID_REASONS: ReadonlySet<SpendReason> = new Set([
  'hint_pack', 'unlock_premium', 'unlock_event', 'daily_retry', 'cosmetic_skin',
])

// Per-reason sanity caps. The client knows the exact prices today but a buggy
// or malicious client could submit absurd amounts; these are a backstop. Tune
// upward as content scales (e.g. if a future premium world costs 5000 gems).
const MAX_AMOUNT_BY_REASON: Record<SpendReason, number> = {
  hint_pack:      1000,
  unlock_premium: 5000,
  unlock_event:   100,
  daily_retry:    50,
  cosmetic_skin:  10000,
}

function isReason(s: unknown): s is SpendReason {
  return typeof s === 'string' && VALID_REASONS.has(s as SpendReason)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Diagnostic guard for the two most common deploy-time misses.
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL is not configured on this deployment' })
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'JWT_SECRET is not configured on this deployment' })
  }

  try {

  const address = await requireAuth(req.headers.authorization)
  if (!address) {
    return res.status(401).json({ error: 'Missing or invalid Authorization bearer token' })
  }

  const { amount, reason, metadata } = (req.body ?? {}) as {
    amount?:   unknown
    reason?:   unknown
    metadata?: unknown
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive integer' })
  }
  if (!isReason(reason)) {
    return res.status(400).json({ error: 'invalid reason' })
  }
  if (amount > MAX_AMOUNT_BY_REASON[reason]) {
    return res.status(400).json({ error: `amount exceeds the per-reason cap for ${reason}` })
  }
  if (metadata !== undefined && (typeof metadata !== 'object' || Array.isArray(metadata) || metadata === null)) {
    return res.status(400).json({ error: 'metadata must be an object' })
  }

  // ── Compound case: hint pack purchase ────────────────────────────────────
  // Buying a hint pack atomically debits gems AND credits hints. The client
  // passes packId in metadata; the server ignores any amount/hints values
  // the client claims and uses the catalog as the truth.
  if (reason === 'hint_pack') {
    const packId = (metadata as { packId?: string })?.packId
    if (!packId || !HINT_PACK_CATALOG[packId]) {
      return res.status(400).json({ error: 'Invalid or missing packId for hint_pack purchase' })
    }
    const pack = HINT_PACK_CATALOG[packId]
    if (amount !== pack.gems) {
      // Client and server disagree on the price — refuse rather than charge
      // the catalog price (could be benign client drift, could be tampering).
      return res.status(400).json({
        error: `Catalog price for ${packId} is ${pack.gems} Gems, client sent ${amount}`,
      })
    }
    const spent = await spendGems({
      address, amount: pack.gems, reason: 'hint_pack', metadata: { packId, hints: pack.hints },
    })
    if (!spent.ok) {
      return res.status(200).json({
        ok: false, newBalance: spent.newBalance, reason: 'insufficient',
      })
    }
    // Credit hints in the same audit-logged transaction. grantHints writes
    // its own row to balance_transactions, so we end up with TWO rows for
    // this purchase (one debit, one credit) — by design, easier to audit.
    const granted = await grantHints({
      address, amount: pack.hints, reason: 'store_purchase',
      metadata: { packId, source: 'in_game_shop' },
    })
    return res.status(200).json({
      ok:             true,
      newBalance:     spent.newBalance,
      newHints:       granted.newBalance,
      hintsGranted:   pack.hints,
      reason,
    })
  }

  // ── Simple debit ─────────────────────────────────────────────────────────
  const result = await spendGems({
    address,
    amount,
    reason,
    metadata: metadata as Record<string, unknown> | undefined,
  })

  // Return 200 with `ok` in the body for both success and "insufficient"
  // — the request was well-formed, we just want to tell the client the
  // outcome. Reserving 4xx for genuinely bad requests (bad auth, bad
  // shape) keeps apiClient.ts's throw-on-error semantics from swallowing
  // the newBalance in the broke case.
  if (!result.ok) {
    return res.status(200).json({
      ok:         false,
      newBalance: result.newBalance,
      reason:     'insufficient',
    })
  }

  return res.status(200).json({
    ok:         true,
    newBalance: result.newBalance,
    reason,
  })
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    const code = e?.code ?? e?.name ?? 'UNKNOWN'
    return res.status(500).json({
      error:  'spend handler threw',
      detail: msg,
      code,
    })
  }
}
