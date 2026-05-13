// POST /api/leaderboard/score
// Body: { eventId: "oceanevent", score: number }
// Headers: Authorization: Bearer <jwt>
// Returns: { ok: true, address, week, score, rank }
//
// Server upserts the player's best-of-week. If the submitted score is lower
// than the existing row, we keep the higher one and return that. The wallet
// address comes from the JWT — never from the request body — to prevent
// spoofing.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { applyCors } from '../_lib/cors'
import { requireAuth } from '../_lib/jwt'
import { currentWeekId } from '../_lib/week'

const MAX_SCORE = 100_000      // sanity cap; tune as the scoring model grows

function isAlnumId(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z0-9_-]{1,32}$/i.test(s)
}

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

  const { eventId, score } = (req.body ?? {}) as { eventId?: string; score?: number }
  if (!isAlnumId(eventId)) return res.status(400).json({ error: 'Invalid eventId' })
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ error: `score must be a number in [0, ${MAX_SCORE}]` })
  }
  const intScore = Math.floor(score)
  const week     = currentWeekId()

  const db = sql()

  // UPSERT keep-best: only overwrite when the new score is strictly greater.
  await db`
    INSERT INTO scores (address, event_id, week_id, score, updated_at)
    VALUES (${address}, ${eventId}, ${week}, ${intScore}, NOW())
    ON CONFLICT (address, event_id, week_id) DO UPDATE
      SET score      = GREATEST(scores.score, EXCLUDED.score),
          updated_at = CASE WHEN EXCLUDED.score > scores.score THEN NOW() ELSE scores.updated_at END
  `

  // Recompute the player's rank with their (possibly improved) score.
  const ranked = await db`
    WITH r AS (
      SELECT
        address,
        score,
        RANK() OVER (ORDER BY score DESC, updated_at ASC) AS rank
      FROM scores
      WHERE event_id = ${eventId} AND week_id = ${week}
    )
    SELECT rank, score FROM r WHERE address = ${address}
  ` as Array<{ rank: number; score: number }>

  const row = ranked[0]
  return res.status(200).json({
    ok:      true,
    address,
    week,
    score:   row?.score ?? intScore,
    rank:    row?.rank ?? null,
  })
}
