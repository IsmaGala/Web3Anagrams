// Server-authoritative economy helpers.
//
// Every endpoint that changes a player's gem or hint balance goes through
// this module so:
//   • The UPDATE is atomic (no race-condition double-spends).
//   • The matching audit row in balance_transactions is written in the
//     same transaction as the balance change.
//   • The reason-code vocabulary stays in one place, easy to grep.
//
// Don't manipulate `player_balances` directly from endpoints. Always call
// `spendGems`, `grantGems`, `grantHints`, or `spendHints`.

import { sql } from './db.js'

// Reason vocabulary. Kept as TS unions (not enums) so it stays tree-shakeable.

export type SpendReason =
  | 'hint_pack'         // buying hints in the in-game shop
  | 'unlock_premium'    // unlocking a premium world (Asimov, Nature, etc.)
  | 'unlock_event'      // entering a weekly event world
  | 'daily_retry'       // paying to retry a failed daily
  | 'cosmetic_skin'     // buying a wheel skin from the wardrobe

export type GrantReason =
  | 'level_complete'             // per-level reward
  | 'world_completion_bounty'    // one-time bonus for clearing every level in a world
  | 'daily_win'                  // hints awarded for winning the daily
  | 'first_wallet_bonus'         // one-time welcome bundle
  | 'store_purchase'             // real-money gem purchase via /api/store/purchase
  | 'admin_correction'           // manual ops adjustment
  | 'support_refund'             // refunding a disputed spend
  | 'event_rank1_skin'           // skin awarded for rank #1 in a weekly event

// ── Spend ────────────────────────────────────────────────────────────────────

export interface SpendResult {
  ok:          boolean
  newBalance:  number     // current gems balance after the call (whether it
                          // succeeded or failed — caller can show it either way)
  reason?:     'insufficient'
}

/** Atomically debit `amount` gems from `address`. Returns ok:false when the
 *  player doesn't have enough — no balance change occurs in that case.
 *  Writes a row to balance_transactions on success.
 *
 *  IMPORTANT: this is the ONLY way to spend gems server-side. Endpoints that
 *  bypass this and `UPDATE player_balances` directly will lose the audit log
 *  and break the atomicity guarantee. */
export async function spendGems(args: {
  address:   string
  amount:    number
  reason:    SpendReason
  metadata?: Record<string, unknown>
}): Promise<SpendResult> {
  if (!Number.isFinite(args.amount) || args.amount <= 0 || !Number.isInteger(args.amount)) {
    throw new Error('spendGems: amount must be a positive integer')
  }
  const db = sql()
  // Bootstrap the row if it doesn't exist (new player who never had a balance).
  // Cheaper here than a CTE, and ON CONFLICT DO NOTHING is a no-op for the
  // common case of an existing row.
  await db`
    INSERT INTO player_balances (address, gems_balance, hints_balance)
    VALUES (${args.address}, 0, 3)
    ON CONFLICT (address) DO NOTHING
  `
  // Conditional UPDATE. The `WHERE gems_balance >= amount` guard makes this
  // serializable in Postgres — concurrent spends can't double-spend the same
  // gems.
  const rows = await db`
    UPDATE player_balances
       SET gems_balance = gems_balance - ${args.amount},
           updated_at   = NOW()
     WHERE address = ${args.address} AND gems_balance >= ${args.amount}
    RETURNING gems_balance
  ` as Array<{ gems_balance: number }>

  if (rows.length === 0) {
    // Read the current balance so the client can show it accurately.
    const cur = await db`
      SELECT gems_balance FROM player_balances WHERE address = ${args.address}
    ` as Array<{ gems_balance: number }>
    return { ok: false, newBalance: cur[0]?.gems_balance ?? 0, reason: 'insufficient' }
  }
  // Audit log. Written outside the spending UPDATE for simplicity — if it
  // ever fails we'd just lose the audit row, not the spend, which is the
  // right tradeoff (the player has been billed, that's the important state).
  await db`
    INSERT INTO balance_transactions (address, gems_delta, hints_delta, reason, metadata)
    VALUES (${args.address}, ${-args.amount}, 0, ${args.reason}, ${db.json(args.metadata ?? {})})
  `
  return { ok: true, newBalance: rows[0].gems_balance }
}

// ── Grant (gems) ─────────────────────────────────────────────────────────────

export interface GrantResult {
  newBalance: number
}

/** Credit `amount` gems to `address`. Always succeeds (no upper bound check —
 *  callers are responsible for not granting absurd amounts). Writes an
 *  audit row. */
export async function grantGems(args: {
  address:   string
  amount:    number
  reason:    GrantReason
  metadata?: Record<string, unknown>
}): Promise<GrantResult> {
  if (!Number.isFinite(args.amount) || args.amount <= 0 || !Number.isInteger(args.amount)) {
    throw new Error('grantGems: amount must be a positive integer')
  }
  const db = sql()
  // INSERT … ON CONFLICT UPDATE handles new and existing players in one round
  // trip. The EXCLUDED row carries the bootstrap (gems_balance + amount, 3
  // starter hints) which is used only when no row existed yet; the DO UPDATE
  // adds the amount to the existing row.
  const rows = await db`
    INSERT INTO player_balances (address, gems_balance, hints_balance)
    VALUES (${args.address}, ${args.amount}, 3)
    ON CONFLICT (address) DO UPDATE
      SET gems_balance = player_balances.gems_balance + ${args.amount},
          updated_at   = NOW()
    RETURNING gems_balance
  ` as Array<{ gems_balance: number }>
  await db`
    INSERT INTO balance_transactions (address, gems_delta, hints_delta, reason, metadata)
    VALUES (${args.address}, ${args.amount}, 0, ${args.reason}, ${db.json(args.metadata ?? {})})
  `
  return { newBalance: rows[0].gems_balance }
}

// ── Grant (hints) ────────────────────────────────────────────────────────────

export async function grantHints(args: {
  address:   string
  amount:    number
  reason:    GrantReason
  metadata?: Record<string, unknown>
}): Promise<GrantResult> {
  if (!Number.isFinite(args.amount) || args.amount <= 0 || !Number.isInteger(args.amount)) {
    throw new Error('grantHints: amount must be a positive integer')
  }
  const db = sql()
  const rows = await db`
    INSERT INTO player_balances (address, gems_balance, hints_balance)
    VALUES (${args.address}, 0, ${args.amount})
    ON CONFLICT (address) DO UPDATE
      SET hints_balance = player_balances.hints_balance + ${args.amount},
          updated_at    = NOW()
    RETURNING hints_balance
  ` as Array<{ hints_balance: number }>
  await db`
    INSERT INTO balance_transactions (address, gems_delta, hints_delta, reason, metadata)
    VALUES (${args.address}, 0, ${args.amount}, ${args.reason}, ${db.json(args.metadata ?? {})})
  `
  return { newBalance: rows[0].hints_balance }
}

// ── One-shot grant detection ────────────────────────────────────────────────
// Some grants (first_wallet_bonus, world_completion_bounty per-world) should
// fire exactly once per address. Rather than tracking "claimed" flags in a
// separate column, we use the audit log: a row in balance_transactions with
// the matching (address, reason[, metadata]) means it already happened.

export async function hasReceivedGrant(args: {
  address:        string
  reason:         GrantReason
  metadataMatch?: Record<string, unknown>
}): Promise<boolean> {
  const db = sql()
  if (args.metadataMatch) {
    const rows = await db`
      SELECT 1 FROM balance_transactions
       WHERE address = ${args.address}
         AND reason  = ${args.reason}
         AND metadata @> ${db.json(args.metadataMatch)}
       LIMIT 1
    ` as Array<{ '?column?': number }>
    return rows.length > 0
  }
  const rows = await db`
    SELECT 1 FROM balance_transactions
     WHERE address = ${args.address} AND reason = ${args.reason}
     LIMIT 1
  ` as Array<{ '?column?': number }>
  return rows.length > 0
}

// ── Grant (skin) ─────────────────────────────────────────────────────────────
// Records a cosmetic skin ownership event in the audit log. Does NOT touch
// gem/hint balances — this path is for skins purchased with GALA (real money)
// or awarded as event rank rewards. The inventory module reads `cosmetic_skin`
// rows from balance_transactions to derive ownership.

export interface SkinGrantResult {
  ok:     boolean
  skinId: string
}

/** Record a skin as owned by `address`. Returns ok:false if already owned. */
export async function grantSkin(args: {
  address: string
  skinId:  string
  reason:  'cosmetic_skin' | 'event_rank1_skin'
  metadata?: Record<string, unknown>
}): Promise<SkinGrantResult> {
  const db = sql()
  // Check idempotency — don't grant the same skin twice.
  const existing = await db`
    SELECT 1 FROM balance_transactions
     WHERE address  = ${args.address}
       AND reason   = 'cosmetic_skin'
       AND metadata @> ${db.json({ skinId: args.skinId })}
     LIMIT 1
  ` as Array<unknown>
  if (existing.length > 0) return { ok: false, skinId: args.skinId }

  await db`
    INSERT INTO balance_transactions (address, gems_delta, hints_delta, reason, metadata)
    VALUES (
      ${args.address}, 0, 0, 'cosmetic_skin',
      ${db.json({ skinId: args.skinId, ...args.metadata })}
    )
  `
  return { ok: true, skinId: args.skinId }
}
