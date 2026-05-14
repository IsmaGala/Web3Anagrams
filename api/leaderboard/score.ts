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
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { currentWeekId, eventPhase } from '../_lib/week.js'

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

  // Reject score submissions during the settled phase. The client UI prevents
  // play during settled, so a request arriving here is either a stale in-flight
  // call from a player who finished a level just before the cutoff (acceptable
  // to drop quietly) or a deliberate hand-crafted POST trying to pollute the
  // next week's leaderboard before the next ACTIVE window opens. Either way,
  // 423 Locked tells the client "valid request, wrong phase".
  if (eventPhase() === 'settled') {
    return res.status(423).json({ error: 'Event is in claim window — score submissions are closed until the next event begins' })
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
  // Cast RANK() to INT so the value comes back as a JS number (the neon
  // serverless driver returns bigint as a string by default). Mirrors the
  // same cast in /api/leaderboard/[event].ts.
  const ranked = await db`
    WITH r AS (
      SELECT
        address,
        score,
        RANK() OVER (ORDER BY score DESC, updated_at ASC)::int AS rank
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
