// POST /api/play/level/submit-word
// Body:    { roundId: string, word: string }
// Headers: Authorization: Bearer <jwt>
// Returns:
//   accepted (primary):
//     { result:'accepted', kind:'primary', scoreDelta, totalScore,
//       slot:{ len, ordinal }, def, completed:boolean, breakdown? }
//   accepted (bonus):
//     { result:'accepted', kind:'bonus', scoreDelta, totalScore, def }
//   rejected: { result:'rejected', reason:'not-in-chain'|'not-makeable', misses }
//   duplicate: { result:'duplicate' }
//
// Why a server endpoint at all (vs. validating locally with a hash):
//   • The client must NOT know the answer set. Even a hashed answer leaks
//     the count and the rough lengths; we want the server to be the only
//     source of truth on "is this word valid for this level".
//   • Completion detection happens here too. As soon as every primary slot
//     is filled, the server marks the round complete and computes the
//     final score breakdown — the client only relays the result.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../../_lib/cors.js'
import { requireAuth } from '../../_lib/jwt.js'
import {
  getLevel, getWorldLevels,
  WORLD_COMPLETION_REWARDS, DAILY_WIN_HINT_REWARD,
} from '../../_data/worldsServerData.js'
import {
  validateLevel, canMakeWord, wordScore, slotForWord, computeScoreBreakdown,
} from '../../_lib/play.js'
import {
  loadRound, appendFoundWord, appendFoundBonus,
  incrementMisses, markCompleted,
} from '../../_lib/round.js'
import { grantGems, grantHints, hasReceivedGrant } from '../../_lib/economy.js'
import { sql } from '../../_lib/db.js'

const MAX_WORD_LEN = 24
const WORD_RE = /^[A-Z]{2,24}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const address = await requireAuth(req.headers.authorization)
  if (!address) {
    return res.status(401).json({ error: 'Missing or invalid Authorization bearer token' })
  }

  const { roundId, word } = (req.body ?? {}) as { roundId?: unknown; word?: unknown }
  if (typeof roundId !== 'string' || !/^r_[\w-]{20,40}$/.test(roundId)) {
    return res.status(400).json({ error: 'Invalid roundId' })
  }
  if (typeof word !== 'string' || word.length > MAX_WORD_LEN) {
    return res.status(400).json({ error: 'Invalid word' })
  }
  const W = word.toUpperCase()
  if (!WORD_RE.test(W)) {
    return res.status(400).json({ error: 'word must be A-Z, 2–24 chars' })
  }

  const round = await loadRound(roundId, address)
  if (!round) return res.status(404).json({ error: 'No such round' })
  if (round.completed_at) {
    return res.status(409).json({ error: 'Round already completed' })
  }

  const level = getLevel(round.world_id, round.level_index)
  if (!level) return res.status(500).json({ error: 'Level data missing for this round' })
  const v = validateLevel(level)

  // ── Duplicate check ───────────────────────────────────────────────────────
  if (round.found_words.includes(W) || round.found_bonus.includes(W)) {
    return res.status(200).json({ result: 'duplicate' })
  }

  // ── Sanity: must be makeable from the wheel ──────────────────────────────
  // Cheap defense against random brute-force scripts trying every word in a
  // dictionary. The wheel letters are public so this isn't a real "is the
  // attempt legitimate" check, but it cuts noise from miss-counting.
  if (!canMakeWord(W, round.shuffled_letters)) {
    const misses = await incrementMisses(roundId)
    return res.status(200).json({ result: 'rejected', reason: 'not-makeable', misses })
  }

  // ── Primary word path ────────────────────────────────────────────────────
  if (v.words.includes(W)) {
    await appendFoundWord(roundId, W)
    const newFound = [...round.found_words, W]
    const slot = slotForWord(v.words, W)
    const def  = level.defs[W] ?? ''
    const sd   = wordScore(W, false)

    // Running primary-score total (bonus is tracked separately for the
    // breakdown — base score in the breakdown is the sum of primary
    // wordScore values + bonus wordScore values, matching the client formula).
    const base = newFound.reduce((s, w) => s + wordScore(w, false), 0)
               + round.found_bonus.reduce((s, w) => s + wordScore(w, true), 0)

    // Completion?
    const completed = v.words.every(w => newFound.includes(w))
    let breakdown: ReturnType<typeof computeScoreBreakdown> | undefined
    let worldCompletionGranted: { amount: number; worldId: string } | undefined
    let dailyWinGranted: { hints: number } | undefined

    if (completed) {
      const startMs = new Date(round.started_at).getTime()
      breakdown = computeScoreBreakdown(
        base,
        round.misses,
        round.hints_revealed.length,
        startMs,
      )
      await markCompleted(roundId, breakdown.final)

      // ── Daily-win reward ──────────────────────────────────────────────────
      // Hints granted server-side now (used to be client-asserted, which let
      // anyone refresh the page after a daily win to multiply the reward).
      // One per (address, day) — gated on whether a 'daily_win' grant has
      // already been written for THIS daily date.
      if (round.mode === 'daily') {
        // The daily date_key is the YYYY-MM-DD when started. Two dailies on
        // different calendar days are independent grants; two completions of
        // the same daily round get exactly one grant.
        const dateKey = new Date(round.started_at).toISOString().slice(0, 10)
        const already = await hasReceivedGrant({
          address,
          reason: 'daily_win',
          metadataMatch: { dateKey },
        })
        if (!already) {
          const r = await grantHints({
            address,
            amount:   DAILY_WIN_HINT_REWARD,
            reason:   'daily_win',
            metadata: { dateKey, worldId: round.world_id },
          })
          dailyWinGranted = { hints: DAILY_WIN_HINT_REWARD }
          void r
        }
      }

      // ── World-completion bounty ───────────────────────────────────────────
      // Only for non-daily, non-premium, non-event runs. We detect "world
      // cleared" by counting distinct level_indexes the player has cleared
      // in this world. If that matches the world's level count and no prior
      // bounty was granted, we grant it now.
      const bounty = WORLD_COMPLETION_REWARDS[round.world_id as keyof typeof WORLD_COMPLETION_REWARDS]
      if (round.mode === 'single' && bounty) {
        const wid = round.world_id
        const worldLevels = getWorldLevels(wid)
        if (worldLevels) {
          // How many distinct levels in this world has the player ever
          // completed? Includes the round we just marked done above.
          const db = sql()
          const rows = await db`
            SELECT COUNT(DISTINCT level_index)::int AS done
              FROM play_rounds
             WHERE address      = ${address}
               AND world_id     = ${wid}
               AND completed_at IS NOT NULL
          ` as Array<{ done: number }>
          const distinctDone = rows[0]?.done ?? 0
          if (distinctDone >= worldLevels.length) {
            const already = await hasReceivedGrant({
              address,
              reason:        'world_completion_bounty',
              metadataMatch: { worldId: wid },
            })
            if (!already) {
              await grantGems({
                address,
                amount:   bounty,
                reason:   'world_completion_bounty',
                metadata: { worldId: wid },
              })
              worldCompletionGranted = { amount: bounty, worldId: wid }
            }
          }
        }
      }
    }

    return res.status(200).json({
      result:      'accepted',
      kind:        'primary',
      scoreDelta:  sd,
      totalScore:  base,
      slot,
      def,
      completed,
      breakdown,
      // Surface any grants that fired so the client can show the right
      // toast / overlay without making a follow-up balance fetch. The
      // balances returned here (if any) are post-grant, authoritative.
      grants: worldCompletionGranted || dailyWinGranted ? {
        worldCompletion: worldCompletionGranted,
        dailyWin:        dailyWinGranted,
      } : undefined,
    })
  }

  // ── Bonus word path ──────────────────────────────────────────────────────
  if (v.bonus.includes(W)) {
    await appendFoundBonus(roundId, W)
    const def = level.defs[W] ?? ''
    const sd  = wordScore(W, true)
    const base = round.found_words.reduce((s, w) => s + wordScore(w, false), 0)
               + [...round.found_bonus, W].reduce((s, w) => s + wordScore(w, true), 0)
    return res.status(200).json({
      result:     'accepted',
      kind:       'bonus',
      scoreDelta: sd,
      totalScore: base,
      def,
    })
  }

  // ── Miss ─────────────────────────────────────────────────────────────────
  const misses = await incrementMisses(roundId)
  return res.status(200).json({ result: 'rejected', reason: 'not-in-chain', misses })
}
