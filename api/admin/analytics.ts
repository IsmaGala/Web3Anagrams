// POST /api/admin/analytics/:action
//
// Gala-platform analytics endpoints — mirrors the Mirandus / Greedy Cubes
// conventions expected by the shared Analytics Dashboard.
//
// All routes require: x-admin-secret: <ADMIN_SECRET> header.
//
// ── Actions ──────────────────────────────────────────────────────────────────
//
//  overview    No body required.
//              Returns KPI snapshot: dau, mau, totalPlayers, newToday,
//              gamesToday, wordsToday, revenueToday, payers.
//
//  daily       Body: { days?: number }  (default 30, max 90)
//              Returns time-series array:
//              [{ date, dau, newPlayers, games, wordsSubmitted, revenue, sessions }]
//
//  retention   No body required.
//              Returns cohort retention for D1/D3/D7/D14/D30:
//              { cohortSize, retention: [{ day, returned, rate }] }

import type { VercelRequest, VercelResponse } from '../_lib/vercel-compat.js'
import { sql }       from '../_lib/db.js'
import { applyCors } from '../_lib/cors.js'

// ── Auth guard ────────────────────────────────────────────────────────────────

function checkAdminSecret(req: VercelRequest, res: VercelResponse): boolean {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    res.status(500).json({ error: 'ADMIN_SECRET is not configured on this deployment' })
    return false
  }
  if (req.headers['x-admin-secret'] !== adminSecret) {
    res.status(401).json({ error: 'Invalid or missing x-admin-secret header' })
    return false
  }
  return true
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!checkAdminSecret(req, res)) return

  const action = (req.params as Record<string, string>)['action'] ?? (req.query['action'] as string)
  const body   = (req.body ?? {}) as Record<string, unknown>
  const db     = sql()

  try {

    // ── overview ────────────────────────────────────────────────────────────

    if (action === 'overview') {
      const results = await Promise.all([
        // DAU — unique active addresses today
        db`SELECT COUNT(DISTINCT address)::int AS dau
             FROM analytics_events
            WHERE received_at >= NOW()::date AND address IS NOT NULL`,

        // MAU — unique active addresses last 30 days
        db`SELECT COUNT(DISTINCT address)::int AS mau
             FROM analytics_events
            WHERE received_at >= NOW() - INTERVAL '30 days' AND address IS NOT NULL`,

        // Total players ever seen
        db`SELECT COUNT(DISTINCT address)::int AS total
             FROM analytics_events
            WHERE address IS NOT NULL`,

        // New wallets today (first-time connects)
        db`SELECT COUNT(*)::int AS new_today
             FROM analytics_events
            WHERE event = 'wallet_connected'
              AND (properties->>'first_time')::boolean = true
              AND received_at >= NOW()::date`,

        // Games (level starts) today
        db`SELECT COUNT(*)::int AS games_today
             FROM analytics_events
            WHERE event = 'level_started'
              AND received_at >= NOW()::date`,

        // Words submitted today (completed + rejected)
        db`SELECT COUNT(*)::int AS words_today
             FROM analytics_events
            WHERE event IN ('word_rejected', 'level_completed')
              AND received_at >= NOW()::date`,

        // Revenue today (sum of gala_spent from successful purchases)
        db`SELECT COALESCE(SUM((properties->>'gala_spent')::numeric), 0) AS revenue_today
             FROM analytics_events
            WHERE event = 'gala_purchase_success'
              AND received_at >= NOW()::date`,

        // Payers — distinct addresses with at least one successful purchase ever
        db`SELECT COUNT(DISTINCT address)::int AS payers
             FROM analytics_events
            WHERE event = 'gala_purchase_success'
              AND address IS NOT NULL`,
      ])

      type R<T> = Array<T>
      const [dauR, mauR, totalR, newR, gamesR, wordsR, revR, payersR] = results as [
        R<{ dau: number }>,
        R<{ mau: number }>,
        R<{ total: number }>,
        R<{ new_today: number }>,
        R<{ games_today: number }>,
        R<{ words_today: number }>,
        R<{ revenue_today: string }>,
        R<{ payers: number }>,
      ]

      return res.status(200).json({
        ok:           true,
        dau:          dauR[0]?.dau          ?? 0,
        mau:          mauR[0]?.mau          ?? 0,
        totalPlayers: totalR[0]?.total      ?? 0,
        newToday:     newR[0]?.new_today    ?? 0,
        gamesToday:   gamesR[0]?.games_today ?? 0,
        wordsToday:   wordsR[0]?.words_today ?? 0,
        revenueToday: parseFloat(revR[0]?.revenue_today ?? '0'),
        payers:       payersR[0]?.payers    ?? 0,
        as_of:        new Date().toISOString(),
      })
    }

    // ── daily ───────────────────────────────────────────────────────────────

    if (action === 'daily') {
      const rawDays = typeof body.days === 'number' ? body.days : 30
      const days    = Math.min(Math.max(Math.floor(rawDays), 1), 90)

      const rows = await db`
        WITH date_series AS (
          SELECT generate_series(
            (NOW() - (${days} || ' days')::interval)::date,
            NOW()::date,
            '1 day'::interval
          )::date AS day
        ),
        daily AS (
          SELECT
            received_at::date                                                   AS day,
            COUNT(DISTINCT address) FILTER (WHERE address IS NOT NULL)          AS dau,
            COUNT(*) FILTER (
              WHERE event = 'wallet_connected'
                AND (properties->>'first_time')::boolean = true)                AS new_players,
            COUNT(*) FILTER (WHERE event = 'level_started')                     AS games,
            COUNT(*) FILTER (WHERE event IN ('word_rejected', 'level_completed')) AS words_submitted,
            COUNT(*) FILTER (WHERE event = 'session_started')                   AS sessions,
            COALESCE(SUM(
              CASE WHEN event = 'gala_purchase_success'
              THEN (properties->>'gala_spent')::numeric ELSE 0 END
            ), 0)                                                                AS revenue
          FROM analytics_events
          WHERE received_at >= (NOW() - (${days} || ' days')::interval)::date
          GROUP BY received_at::date
        )
        SELECT
          d.day::text                               AS date,
          COALESCE(e.dau,            0)::int        AS dau,
          COALESCE(e.new_players,    0)::int        AS "newPlayers",
          COALESCE(e.games,          0)::int        AS games,
          COALESCE(e.words_submitted,0)::int        AS "wordsSubmitted",
          COALESCE(e.sessions,       0)::int        AS sessions,
          COALESCE(e.revenue,        0)::numeric    AS revenue
        FROM date_series d
        LEFT JOIN daily e ON e.day = d.day
        ORDER BY d.day ASC
      ` as Array<{
        date: string; dau: number; newPlayers: number
        games: number; wordsSubmitted: number; sessions: number; revenue: string
      }>

      return res.status(200).json({
        ok:   true,
        days,
        series: rows.map(r => ({ ...r, revenue: parseFloat(r.revenue) })),
      })
    }

    // ── retention ───────────────────────────────────────────────────────────
    // Cohort = wallets that connected for the first time >= 30 days ago.
    // For each retention day (D1/D3/D7/D14/D30) count how many returned.

    if (action === 'retention') {
      const cohortDays = 30
      const retentionDays = [1, 3, 7, 14, 30]

      // Cohort: first-time wallet connects at least 30 days ago so all
      // retention windows are measurable.
      const cohortRows = await db`
        SELECT address, MIN(received_at)::date AS cohort_day
          FROM analytics_events
         WHERE event     = 'wallet_connected'
           AND (properties->>'first_time')::boolean = true
           AND address   IS NOT NULL
           AND received_at < NOW() - INTERVAL '30 days'
         GROUP BY address
      ` as Array<{ address: string; cohort_day: string }>

      const cohortSize = cohortRows.length

      if (cohortSize === 0) {
        return res.status(200).json({
          ok:          true,
          cohortSize:  0,
          retention:   retentionDays.map(day => ({ day, returned: 0, rate: 0 })),
        })
      }

      // For each retention window, count cohort members who had any event
      // within [cohort_day + Dn, cohort_day + Dn + 1 day) grace window.
      const retentionResults = await Promise.all(
        retentionDays.map(d => db`
          SELECT COUNT(DISTINCT c.address)::int AS returned
            FROM (
              SELECT address, MIN(received_at)::date AS cohort_day
                FROM analytics_events
               WHERE event     = 'wallet_connected'
                 AND (properties->>'first_time')::boolean = true
                 AND address   IS NOT NULL
                 AND received_at < NOW() - INTERVAL '30 days'
               GROUP BY address
            ) c
            JOIN analytics_events e ON e.address = c.address
           WHERE e.received_at::date
             BETWEEN c.cohort_day + ${d}
                 AND c.cohort_day + ${d + 1}
        ` as Promise<Array<{ returned: number }>>)
      )

      const retention = retentionDays.map((day, i) => {
        const returned = retentionResults[i][0]?.returned ?? 0
        return {
          day,
          returned,
          rate: cohortSize > 0 ? Math.round((returned / cohortSize) * 1000) / 10 : 0,
        }
      })

      return res.status(200).json({
        ok:         true,
        cohortSize,
        cohortDays,
        retention,
      })
    }

    // ── unknown action ──────────────────────────────────────────────────────

    return res.status(404).json({
      error: `Unknown action: "${action}". Valid: overview, daily, retention`,
    })

  } catch (e: any) {
    console.error(`[admin/analytics/${action}] error:`, e?.message ?? e)
    return res.status(500).json({ error: 'Internal server error', detail: e?.message ?? String(e) })
  }
}
