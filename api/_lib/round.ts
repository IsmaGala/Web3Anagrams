// Round state management.
//
// Each entry in `play_rounds` is one player's attempt at one level. The
// endpoints in /api/play/level/* call into this module to create, load,
// mutate, and complete rounds — they never touch the SQL directly.
//
// Why a server-side round at all (vs. signed JWT carrying state)?
//   • Concurrent updates: multiple submit-word requests interleave; a DB row
//     gives us atomic updates via the words::jsonb || word append.
//   • Auditability: ops can `SELECT * FROM play_rounds WHERE address = …` to
//     reconstruct any disputed claim of cheating or unfairness.
//   • Hint balance: lives in `player_balances`; the round and the deduction
//     must succeed or fail together, which a DB transaction handles.
//
// The roundId itself is a high-entropy random string. The endpoints never
// trust the client about which round is theirs — every action checks
// `WHERE round_id = $1 AND address = $2` so a leaked roundId is useless
// without the matching JWT.

import { randomBytes } from 'crypto'
import { sql } from './db.js'

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoundRow {
  round_id:         string
  address:          string
  world_id:         string
  level_index:      number
  mode:             'single' | 'daily'
  shuffled_letters: string[]
  found_words:      string[]
  found_bonus:      string[]
  hints_revealed:   HintReveal[]
  misses:           number
  started_at:       string   // ISO timestamp
  completed_at:     string | null
  final_score:      number | null
}

export interface HintReveal {
  len:      number
  ordinal:  number
  position: number
  letter:   string
}

// ── ID generation ────────────────────────────────────────────────────────────

/** Generate an opaque round id. 18 bytes ≈ 144 bits of entropy, base32-ish so
 *  it's URL-safe and reasonably short. Prefixed `r_` for readability in logs. */
export function newRoundId(): string {
  return 'r_' + randomBytes(18).toString('base64url')
}

/** Deterministic per-round seed for the shuffle. Hash-derived from round_id
 *  so the same round always shuffles letters the same way — useful for
 *  replay and for proving to support that two attempts saw the same wheel
 *  if needed. Truncated to 31 bits to fit mulberry32's seed range. */
export function seedFromRoundId(roundId: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < roundId.length; i++) {
    h ^= roundId.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h & 0x7FFFFFFF
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createRound(args: {
  address:         string
  worldId:         string
  levelIndex:      number
  mode:            'single' | 'daily'
  shuffledLetters: string[]
}): Promise<RoundRow> {
  const roundId = newRoundId()
  const db = sql()
  await db`
    INSERT INTO play_rounds (round_id, address, world_id, level_index, mode, shuffled_letters)
    VALUES (${roundId}, ${args.address}, ${args.worldId}, ${args.levelIndex},
            ${args.mode}, ${db.json(args.shuffledLetters)})
  `
  return {
    round_id:         roundId,
    address:          args.address,
    world_id:         args.worldId,
    level_index:      args.levelIndex,
    mode:             args.mode,
    shuffled_letters: args.shuffledLetters,
    found_words:      [],
    found_bonus:      [],
    hints_revealed:   [],
    misses:           0,
    started_at:       new Date().toISOString(),
    completed_at:     null,
    final_score:      null,
  }
}

/** Load a round AND verify it belongs to this address. Returns null when
 *  either the round doesn't exist or the address mismatches. Endpoints
 *  should treat both cases identically (return 404) so a probe can't tell
 *  the difference between "no such round" and "not yours". */
export async function loadRound(roundId: string, address: string): Promise<RoundRow | null> {
  const db = sql()
  const rows = await db`
    SELECT round_id, address, world_id, level_index, mode,
           shuffled_letters, found_words, found_bonus, hints_revealed,
           misses, started_at, completed_at, final_score
    FROM play_rounds
    WHERE round_id = ${roundId} AND address = ${address}
    LIMIT 1
  ` as Array<any>
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    round_id:         r.round_id,
    address:          r.address,
    world_id:         r.world_id,
    level_index:      r.level_index,
    mode:             r.mode,
    shuffled_letters: Array.isArray(r.shuffled_letters) ? r.shuffled_letters : JSON.parse(r.shuffled_letters ?? '[]'),
    found_words:      Array.isArray(r.found_words)      ? r.found_words      : JSON.parse(r.found_words      ?? '[]'),
    found_bonus:      Array.isArray(r.found_bonus)      ? r.found_bonus      : JSON.parse(r.found_bonus      ?? '[]'),
    hints_revealed:   Array.isArray(r.hints_revealed)   ? r.hints_revealed   : JSON.parse(r.hints_revealed   ?? '[]'),
    misses:           r.misses,
    started_at:       (r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at),
    completed_at:     r.completed_at ? (r.completed_at instanceof Date ? r.completed_at.toISOString() : r.completed_at) : null,
    final_score:      r.final_score,
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Append a primary word to `found_words`. No-op when the word is already
 *  in the array (caller should distinguish 'duplicate' before calling). */
export async function appendFoundWord(roundId: string, word: string): Promise<void> {
  const db = sql()
  await db`
    UPDATE play_rounds
       SET found_words = (
             CASE WHEN found_words @> ${db.json([word])}
                  THEN found_words
                  ELSE found_words || ${db.json([word])}
             END)
     WHERE round_id = ${roundId}
  `
}

export async function appendFoundBonus(roundId: string, word: string): Promise<void> {
  const db = sql()
  await db`
    UPDATE play_rounds
       SET found_bonus = (
             CASE WHEN found_bonus @> ${db.json([word])}
                  THEN found_bonus
                  ELSE found_bonus || ${db.json([word])}
             END)
     WHERE round_id = ${roundId}
  `
}

export async function incrementMisses(roundId: string): Promise<number> {
  const db = sql()
  const rows = await db`
    UPDATE play_rounds SET misses = misses + 1 WHERE round_id = ${roundId}
    RETURNING misses
  ` as Array<{ misses: number }>
  return rows[0]?.misses ?? 0
}

export async function appendHintReveal(roundId: string, hint: HintReveal): Promise<void> {
  const db = sql()
  await db`
    UPDATE play_rounds
       SET hints_revealed = hints_revealed || ${db.json([hint])}
     WHERE round_id = ${roundId}
  `
}

export async function markCompleted(
  roundId:    string,
  finalScore: number,
): Promise<void> {
  const db = sql()
  await db`
    UPDATE play_rounds
       SET completed_at = NOW(),
           final_score  = ${finalScore}
     WHERE round_id = ${roundId} AND completed_at IS NULL
  `
}

// ── Hint balance (player_balances) ──────────────────────────────────────────
// Atomic decrement-or-fail. Returns the new balance on success, or null when
// the player has 0 hints (in which case the endpoint should return 402).

export async function tryDecrementHints(address: string): Promise<number | null> {
  const db = sql()
  // Ensure the row exists. ON CONFLICT DO NOTHING keeps existing balances
  // intact across repeat calls (re-seeded by the 0003 migration originally).
  await db`
    INSERT INTO player_balances (address, gems_balance, hints_balance)
    VALUES (${address}, 0, 3)
    ON CONFLICT (address) DO NOTHING
  `
  // Conditional decrement: only fires when the balance is > 0, so we get
  // exactly one row back when the spend succeeded and zero rows when the
  // player is broke. No race condition — UPDATE … WHERE balance > 0 is
  // serializable in Postgres.
  const rows = await db`
    UPDATE player_balances
       SET hints_balance = hints_balance - 1,
           updated_at    = NOW()
     WHERE address = ${address} AND hints_balance > 0
    RETURNING hints_balance
  ` as Array<{ hints_balance: number }>
  return rows.length > 0 ? rows[0].hints_balance : null
}

export async function getBalances(address: string): Promise<{ gems: number; hints: number }> {
  const db = sql()
  const rows = await db`
    SELECT gems_balance, hints_balance FROM player_balances WHERE address = ${address} LIMIT 1
  ` as Array<{ gems_balance: number; hints_balance: number }>
  if (rows.length === 0) return { gems: 0, hints: 0 }
  return { gems: rows[0].gems_balance, hints: rows[0].hints_balance }
}
