// GET /api/leaderboard/[event]?week=NN
// Returns:
//   {
//     event:   "oceanevent",
//     week:    2832,
//     top:     [ { rank, address, score, discord_handle?, discord_avatar_url? }, ... up to 100 ],
//     you:     { rank, address, score, discord_handle?, discord_avatar_url? } | null
//   }
//
// Auth header is OPTIONAL — anonymous viewers see the top 100 only. Sending
// a valid Bearer JWT adds the `you` block with the caller's own rank.
//
// Discord fields are present only when the player has linked their Discord account.
// Rank uses RANK() so ties share a position.

import type { VercelRequest, VercelResponse } from '../_lib/vercel-compat.js'
import { sql } from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { currentWeekId } from '../_lib/week.js'

const TOP_N = 100

function isAlnumId(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z0-9_-]{1,32}$/i.test(s)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // event comes from the Express route param (/api/leaderboard/:event)
  const rawEvent = (req.params as Record<string, string>)['event'] ?? req.query.event
  const event = rawEvent
  const eventId = Array.isArray(event) ? event[0] : event
  if (!isAlnumId(eventId)) {
    return res.status(400).json({ error: 'Invalid event id' })
  }

  const weekParam = Array.isArray(req.query.week) ? req.query.week[0] : req.query.week
  const week = weekParam ? parseInt(weekParam, 10) : currentWeekId()
  if (!Number.isFinite(week) || week < 0) {
    return res.status(400).json({ error: 'Invalid week' })
  }

  const db = sql()

  // Top N entries with dense rank.
  //
  // NOTE: RANK() returns a Postgres `bigint`, which @neondatabase/serverless
  // deserializes as a JS *string* (to dodge int53 precision issues). Casting
  // to INT here keeps the value comfortably within JS number range and lets
  // the wire format come back as a real number, so strict-equality / arithmetic
  // on the client work without surprise coercions.
  type LeaderboardRow = {
    rank: number
    address: string
    score: number
    discord_handle: string | null
    discord_avatar_url: string | null
  }

  const top = await db`
    SELECT
      RANK() OVER (ORDER BY s.score DESC, s.updated_at ASC)::int AS rank,
      s.address,
      s.score,
      dc.discord_handle,
      CASE
        WHEN dc.discord_id IS NOT NULL AND dc.discord_avatar IS NOT NULL
          THEN 'https://cdn.discordapp.com/avatars/' || dc.discord_id || '/' || dc.discord_avatar || '.png'
        ELSE NULL
      END AS discord_avatar_url
    FROM scores s
    LEFT JOIN discord_connections dc ON dc.address = s.address
    WHERE s.event_id = ${eventId} AND s.week_id = ${week}
    ORDER BY rank
    LIMIT ${TOP_N}
  ` as LeaderboardRow[]

  // Caller's own row, if authenticated. Same INT cast applies.
  let you: LeaderboardRow | null = null
  const authAddress = await requireAuth(req.headers.authorization)
  if (authAddress) {
    const youRows = await db`
      WITH ranked AS (
        SELECT
          s.address,
          s.score,
          RANK() OVER (ORDER BY s.score DESC, s.updated_at ASC)::int AS rank,
          dc.discord_handle,
          CASE
            WHEN dc.discord_id IS NOT NULL AND dc.discord_avatar IS NOT NULL
              THEN 'https://cdn.discordapp.com/avatars/' || dc.discord_id || '/' || dc.discord_avatar || '.png'
            ELSE NULL
          END AS discord_avatar_url
        FROM scores s
        LEFT JOIN discord_connections dc ON dc.address = s.address
        WHERE s.event_id = ${eventId} AND s.week_id = ${week}
      )
      SELECT rank, address, score, discord_handle, discord_avatar_url
      FROM ranked
      WHERE address = ${authAddress}
      LIMIT 1
    ` as LeaderboardRow[]
    you = youRows[0] ?? null
  }

  return res.status(200).json({
    event: eventId,
    week,
    top,
    you,
  })
}
