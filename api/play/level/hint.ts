// POST /api/play/level/hint
// Body:    { roundId: string }
// Headers: Authorization: Bearer <jwt>
// Returns:
//   ok    : { slot:{ len, ordinal }, position, letter, hintsRemaining }
//   402   : { error:'no-hints' }   (no hint balance — client shows shop)
//   409   : { error:'no-hintable-slot' } (every slot full or fully revealed)
//   404   : { error:'No such round' }
//
// The server is the only thing that knows which slot to reveal and which
// letter goes there. We charge one hint from `player_balances.hints_balance`
// (atomic — succeeds or fails as a unit) and write the reveal into the
// round's `hints_revealed` JSONB array.
//
// Daily mode disables hints by design — the client gates this in UI today
// and we double-check server-side so a hand-crafted POST during daily can't
// drain a free hint.

import type { VercelRequest, VercelResponse } from '../../_lib/vercel-compat.js'
import { applyCors } from '../../_lib/cors.js'
import { requireAuth } from '../../_lib/jwt.js'
import { getLevel } from '../../_data/worldsServerData.js'
import { validateLevel, slotForWord } from '../../_lib/play.js'
import { loadRound, appendHintReveal, tryDecrementHints, type HintReveal } from '../../_lib/round.js'
import { track } from '../../_lib/analytics.js'

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

  const { roundId } = (req.body ?? {}) as { roundId?: unknown }
  if (typeof roundId !== 'string' || !/^r_[\w-]{20,40}$/.test(roundId)) {
    return res.status(400).json({ error: 'Invalid roundId' })
  }

  const round = await loadRound(roundId, address)
  if (!round) return res.status(404).json({ error: 'No such round' })
  if (round.completed_at) {
    return res.status(409).json({ error: 'Round already completed' })
  }
  if (round.mode === 'daily') {
    return res.status(403).json({ error: 'Hints are disabled in daily mode' })
  }

  const level = getLevel(round.world_id, round.level_index)
  if (!level) return res.status(500).json({ error: 'Level data missing for this round' })
  const v = validateLevel(level)

  // Build the set of slots that still have at least one un-revealed,
  // un-filled letter position. We need the actual word to know which letter
  // to return — that's why this can only happen server-side.
  const found = new Set(round.found_words)
  type Candidate = { word: string; position: number }
  const candidates: Candidate[] = []

  for (const word of v.words) {
    if (found.has(word)) continue
    const slot = slotForWord(v.words, word)
    if (!slot) continue
    // Which positions of THIS word are still hidden?
    const alreadyRevealedPositions = new Set(
      round.hints_revealed
        .filter(h => h.len === slot.len && h.ordinal === slot.ordinal)
        .map(h => h.position),
    )
    for (let pos = 0; pos < word.length; pos++) {
      if (!alreadyRevealedPositions.has(pos)) candidates.push({ word, position: pos })
    }
  }

  if (candidates.length === 0) {
    return res.status(409).json({ error: 'no-hintable-slot' })
  }

  // Charge one hint BEFORE picking — so concurrent hint clicks can't both
  // succeed when the player only has one hint. If the deduction fails the
  // player is broke; tell them to top up.
  const newBalance = await tryDecrementHints(address)
  if (newBalance === null) {
    track('hint_denied_no_balance', {
      address,
      round_id:    roundId,
      world_id:    round.world_id,
      level_index: round.level_index,
    })
    return res.status(402).json({ error: 'no-hints' })
  }

  // Random candidate. Math.random() is fine here — the picked slot is
  // public after the hint anyway, so an adversary gaining advance knowledge
  // of the choice has nothing to gain.
  const pick = candidates[Math.floor(Math.random() * candidates.length)]
  const slot = slotForWord(v.words, pick.word)! // existence guaranteed by build above
  const reveal: HintReveal = {
    len:      slot.len,
    ordinal:  slot.ordinal,
    position: pick.position,
    letter:   pick.word[pick.position],
  }
  await appendHintReveal(roundId, reveal)

  track('hint_used', {
    address,
    round_id:       roundId,
    world_id:       round.world_id,
    level_index:    round.level_index,
    hints_remaining: newBalance,
  })

  return res.status(200).json({
    slot:           { len: reveal.len, ordinal: reveal.ordinal },
    position:       reveal.position,
    letter:         reveal.letter,
    hintsRemaining: newBalance,
  })
}
