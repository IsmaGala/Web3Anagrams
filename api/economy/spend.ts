// POST /api/economy/spend
// Body:    { amount: number, reason: SpendReason, metadata?: object }
// Headers: Authorization: Bearer <jwt>
// Returns:
//   ok:           200 { ok: true,  newBalance, reason }
//   broke:        200 { ok: false, newBalance, reason: 'insufficient' }
//   already-own:  200 { ok: false, newBalance, reason: 'already-owned' }
//
// This is the ONLY way the client can deduct gems. Every spend site —
// hint pack purchase, premium world unlock, weekly event, daily retry,
// cosmetic skin — POSTs here. The server is authoritative: if the player
// edits localStorage to show 99999 gems, the server still rejects spends
// they can't actually afford.
//
// Ownership is also server-authoritative as of milestone 3: for
// cosmetic_skin / unlock_premium / unlock_event, the metadata that
// identifies the thing being bought (skinId, worldId, weekId) is recorded
// in balance_transactions. /api/profile derives the player's inventory
// from those rows. This means a player who buys a skin can never lose it
// to a localStorage wipe — the audit log is the record of ownership.
//
// Idempotency: spending on an item you already own is refused without
// debiting. This is a strict guarantee, not a UX nicety — the previous
// pattern (client checks then spends) was racy enough that a player
// could double-tap UNLOCK fast and pay twice.

import type { VercelRequest, VercelResponse } from '../_lib/vercel-compat.js'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { spendGems, grantHints, type SpendReason } from '../_lib/economy.js'
import { alreadyOwns } from '../_lib/inventory.js'
import { track } from '../_lib/analytics.js'

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

// Loose-but-strict format validators. World IDs and skin IDs are
// alphanumeric snake_case in this codebase; weekIds are non-negative
// integers (currentWeekId in api/_lib/week.ts is a positive int after
// 1970). Reject anything that doesn't fit so a typo doesn't get logged
// as a permanent "you own a skin called undefined" record.
function isSlug(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z0-9_]{1,32}$/i.test(s)
}
function isWeekId(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 1_000_000
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

  // Diagnostic guards.
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
    const md = (metadata ?? {}) as Record<string, unknown>

    // ── Ownership-creating reasons: strict metadata + idempotency ─────────
    // The metadata field that identifies the thing being bought is what gets
    // persisted in balance_transactions. We MUST validate its shape here —
    // a logged ownership row with metadata `{}` is unrecoverable.
    let ownershipMatch: Record<string, unknown> | null = null

    if (reason === 'cosmetic_skin') {
      if (!isSlug(md.skinId)) {
        return res.status(400).json({ error: 'cosmetic_skin spend requires metadata.skinId (slug)' })
      }
      ownershipMatch = { skinId: md.skinId }
    } else if (reason === 'unlock_premium') {
      if (!isSlug(md.worldId)) {
        return res.status(400).json({ error: 'unlock_premium spend requires metadata.worldId (slug)' })
      }
      ownershipMatch = { worldId: md.worldId }
    } else if (reason === 'unlock_event') {
      if (!isSlug(md.worldId) || !isWeekId(md.weekId)) {
        return res.status(400).json({ error: 'unlock_event spend requires metadata.worldId (slug) and metadata.weekId (int)' })
      }
      ownershipMatch = { worldId: md.worldId, weekId: md.weekId }
    }

    // Idempotency: refuse the spend (and don't debit) if the player already
    // owns this specific item. The client should know not to ask, but a
    // race or a tampered client could try anyway.
    if (ownershipMatch) {
      const already = await alreadyOwns({
        address,
        reason: reason as 'cosmetic_skin' | 'unlock_premium' | 'unlock_event',
        match:  ownershipMatch,
      })
      if (already) {
        // We deliberately don't read the current balance here — the client
        // already has it from the most recent /api/profile or last spend
        // response, and a follow-up /api/profile call surfaces it cheaply
        // if it's actually needed. Saves a round trip on the common path.
        return res.status(200).json({
          ok:     false,
          reason: 'already-owned',
        })
      }
    }

    // ── Compound case: hint pack purchase ────────────────────────────────
    // Buying a hint pack atomically debits gems AND credits hints. The
    // client passes packId in metadata; the server ignores any amount/hints
    // values the client claims and uses the catalog as the truth.
    if (reason === 'hint_pack') {
      const packId = typeof md.packId === 'string' ? md.packId : ''
      if (!packId || !HINT_PACK_CATALOG[packId]) {
        return res.status(400).json({ error: 'Invalid or missing packId for hint_pack purchase' })
      }
      const pack = HINT_PACK_CATALOG[packId]
      if (amount !== pack.gems) {
        return res.status(400).json({
          error: `Catalog price for ${packId} is ${pack.gems} Gems, client sent ${amount}`,
        })
      }
      const spent = await spendGems({
        address, amount: pack.gems, reason: 'hint_pack',
        metadata: { packId, hints: pack.hints },
      })
      if (!spent.ok) {
        return res.status(200).json({
          ok: false, newBalance: spent.newBalance, reason: 'insufficient',
        })
      }
      const granted = await grantHints({
        address, amount: pack.hints, reason: 'store_purchase',
        metadata: { packId, source: 'in_game_shop' },
      })
      track('gem_spent', {
        address,
        amount:  pack.gems,
        reason:  'hint_pack',
        pack_id: packId,
        hints_granted: pack.hints,
        new_balance: spent.newBalance,
      })
      return res.status(200).json({
        ok:           true,
        newBalance:   spent.newBalance,
        newHints:     granted.newBalance,
        hintsGranted: pack.hints,
        reason,
      })
    }

    // ── Simple debit ─────────────────────────────────────────────────────
    // For ownership-creating reasons, ownershipMatch is what gets written
    // into balance_transactions.metadata so getInventory() can find it.
    // For non-ownership debits (daily_retry), pass whatever metadata the
    // client supplied verbatim.
    const persistMeta = ownershipMatch ?? (md as Record<string, unknown>)
    const result = await spendGems({
      address,
      amount,
      reason,
      metadata: persistMeta,
    })

    if (!result.ok) {
      return res.status(200).json({
        ok:         false,
        newBalance: result.newBalance,
        reason:     'insufficient',
      })
    }

    track('gem_spent', {
      address,
      amount,
      reason,
      new_balance: result.newBalance,
      ...persistMeta,
    })
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
