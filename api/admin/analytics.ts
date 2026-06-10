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
      // Each retention window uses its own cohort: only players who joined
      // far enough ago that the window is already measurable. This means D1
      // shows data from day 2 of launch, D7 from day 8, etc. — rather than
      // waiting 30 days before any retention signal appears.
      const retentionDays = [1, 3, 7, 14, 30]

      const retentionResults = await Promise.all(
        retentionDays.map(d => db`
          SELECT
            COUNT(DISTINCT c.address)::int                            AS cohort_size,
            COUNT(DISTINCT e.address)::int                            AS returned
          FROM (
            -- Cohort for this window: first-time connects old enough that
            -- day-D has already passed (joined more than D days ago).
            SELECT address, MIN(received_at)::date AS cohort_day
              FROM analytics_events
             WHERE event   = 'wallet_connected'
               AND (properties->>'first_time')::boolean = true
               AND address IS NOT NULL
               AND received_at < NOW() - (${d} || ' days')::interval
             GROUP BY address
          ) c
          LEFT JOIN analytics_events e
            ON  e.address = c.address
            AND e.received_at::date
                BETWEEN c.cohort_day + ${d}
                    AND c.cohort_day + ${d + 1}
        ` as Promise<Array<{ cohort_size: number; returned: number }>>)
      )

      const retention = retentionDays.map((day, i) => {
        const row        = retentionResults[i][0]
        const cohortSize = row?.cohort_size ?? 0
        const returned   = row?.returned    ?? 0
        return {
          day,
          cohortSize,
          returned,
          rate: cohortSize > 0 ? Math.round((returned / cohortSize) * 1000) / 10 : 0,
        }
      })

      // Surface the D1 cohort size as the headline (most players qualify for it).
      const headlineCohortSize = retention[0]?.cohortSize ?? 0

      return res.status(200).json({
        ok:         true,
        cohortSize: headlineCohortSize,
        retention,
      })
    }

    // ── sessions ────────────────────────────────────────────────────────────
    // Body: { days?: number }  (default 30, max 90)
    // Returns daily session counts + avg session length (if session_ended is tracked).

    if (action === 'sessions') {
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
            received_at::date                                             AS day,
            COUNT(*) FILTER (WHERE event = 'session_started')::int        AS sessions,
            COUNT(DISTINCT address) FILTER (
              WHERE event = 'session_started' AND address IS NOT NULL)::int AS unique_users,
            ROUND(AVG(
              CASE WHEN event = 'session_ended'
              THEN (properties->>'duration_ms')::numeric ELSE NULL END
            ) / 1000, 1)                                                  AS avg_duration_s
          FROM analytics_events
          WHERE received_at >= (NOW() - (${days} || ' days')::interval)::date
          GROUP BY received_at::date
        )
        SELECT
          d.day::text                                   AS date,
          COALESCE(e.sessions,      0)::int             AS sessions,
          COALESCE(e.unique_users,  0)::int             AS "uniqueUsers",
          e.avg_duration_s::float                       AS "avgDurationSeconds"
        FROM date_series d
        LEFT JOIN daily e ON e.day = d.day
        ORDER BY d.day ASC
      ` as Array<{
        date: string; sessions: number; uniqueUsers: number; avgDurationSeconds: number | null
      }>

      return res.status(200).json({ ok: true, days, series: rows })
    }

    // ── top-players ─────────────────────────────────────────────────────────
    // Body: { days?: number, limit?: number }
    // Returns top addresses by levels completed and total score.

    if (action === 'top-players') {
      const rawDays  = typeof body.days  === 'number' ? body.days  : 30
      const rawLimit = typeof body.limit === 'number' ? body.limit : 20
      const days  = Math.min(Math.max(Math.floor(rawDays),  1), 90)
      const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 100)

      const rows = await db`
        SELECT
          address,
          COUNT(*) FILTER (WHERE event = 'level_completed')::int  AS levels_completed,
          COUNT(*) FILTER (WHERE event = 'level_started')::int    AS levels_started,
          COALESCE(SUM(
            CASE WHEN event = 'level_completed'
            THEN (properties->>'final_score')::numeric ELSE 0 END
          ), 0)::int                                               AS total_score
        FROM analytics_events
        WHERE address IS NOT NULL
          AND event IN ('level_started', 'level_completed')
          AND received_at >= NOW() - (${days} || ' days')::interval
        GROUP BY address
        ORDER BY levels_completed DESC, total_score DESC
        LIMIT ${limit}
      ` as Array<{ address: string; levels_completed: number; levels_started: number; total_score: number }>

      return res.status(200).json({ ok: true, days, players: rows })
    }

    // ── top-gem-spenders ────────────────────────────────────────────────────
    // Body: { days?: number, limit?: number }

    if (action === 'top-gem-spenders') {
      const rawDays  = typeof body.days  === 'number' ? body.days  : 30
      const rawLimit = typeof body.limit === 'number' ? body.limit : 20
      const days  = Math.min(Math.max(Math.floor(rawDays),  1), 90)
      const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 100)

      const rows = await db`
        SELECT
          address,
          COUNT(*)::int                                             AS spend_events,
          COALESCE(SUM((properties->>'amount')::numeric), 0)::int  AS total_gems_spent
        FROM analytics_events
        WHERE event   = 'gem_spent'
          AND address IS NOT NULL
          AND received_at >= NOW() - (${days} || ' days')::interval
        GROUP BY address
        ORDER BY total_gems_spent DESC
        LIMIT ${limit}
      ` as Array<{ address: string; spend_events: number; total_gems_spent: number }>

      return res.status(200).json({ ok: true, days, spenders: rows })
    }

    // ── top-gala-spenders ───────────────────────────────────────────────────
    // Body: { days?: number, limit?: number }

    if (action === 'top-gala-spenders') {
      const rawDays  = typeof body.days  === 'number' ? body.days  : 30
      const rawLimit = typeof body.limit === 'number' ? body.limit : 20
      const days  = Math.min(Math.max(Math.floor(rawDays),  1), 90)
      const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 100)

      const rows = await db`
        SELECT
          address,
          COUNT(*)::int                                                       AS purchases,
          COALESCE(SUM((properties->>'gala_spent')::numeric), 0)::numeric    AS total_gala_spent
        FROM analytics_events
        WHERE event   = 'gala_purchase_success'
          AND address IS NOT NULL
          AND received_at >= NOW() - (${days} || ' days')::interval
        GROUP BY address
        ORDER BY total_gala_spent DESC
        LIMIT ${limit}
      ` as Array<{ address: string; purchases: number; total_gala_spent: string }>

      return res.status(200).json({
        ok:  true,
        days,
        spenders: rows.map(r => ({ ...r, total_gala_spent: parseFloat(r.total_gala_spent) })),
      })
    }

    // ── player-hints ────────────────────────────────────────────────────────
    // Top hint users + overall hint stats.
    // Body: { days?: number, limit?: number }

    if (action === 'player-hints') {
      const rawDays  = typeof body.days  === 'number' ? body.days  : 30
      const rawLimit = typeof body.limit === 'number' ? body.limit : 20
      const days  = Math.min(Math.max(Math.floor(rawDays),  1), 90)
      const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 100)

      const [topRows, statsRows] = await Promise.all([
        db`
          SELECT
            address,
            COUNT(*)::int  AS hints_used
          FROM analytics_events
          WHERE event   = 'hint_used'
            AND address IS NOT NULL
            AND received_at >= NOW() - (${days} || ' days')::interval
          GROUP BY address
          ORDER BY hints_used DESC
          LIMIT ${limit}
        ` as Promise<Array<{ address: string; hints_used: number }>>,

        db`
          SELECT
            COUNT(*)::int                                           AS total_hints_used,
            COUNT(DISTINCT address)::int                            AS unique_users,
            ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT address), 0), 2)
                                                                    AS avg_hints_per_player,
            COUNT(*) FILTER (
              WHERE event = 'hint_denied_no_balance')::int          AS hints_denied
          FROM analytics_events
          WHERE event IN ('hint_used', 'hint_denied_no_balance')
            AND received_at >= NOW() - (${days} || ' days')::interval
        ` as Promise<Array<{
          total_hints_used: number; unique_users: number
          avg_hints_per_player: string; hints_denied: number
        }>>,
      ])

      const s = statsRows[0]
      return res.status(200).json({
        ok:   true,
        days,
        stats: {
          total_hints_used:    s?.total_hints_used    ?? 0,
          unique_users:        s?.unique_users        ?? 0,
          avg_hints_per_player: parseFloat(s?.avg_hints_per_player ?? '0'),
          hints_denied:        s?.hints_denied        ?? 0,
        },
        top_users: topRows,
      })
    }

    // ── session-stats ───────────────────────────────────────────────────────
    // Average session length and sessions per user.
    // Body: { days?: number }

    if (action === 'session-stats') {
      const rawDays = typeof body.days === 'number' ? body.days : 30
      const days    = Math.min(Math.max(Math.floor(rawDays), 1), 90)

      const rows = await db`
        SELECT
          COUNT(*) FILTER (WHERE event = 'session_started')::int           AS total_sessions,
          COUNT(DISTINCT address) FILTER (
            WHERE event = 'session_started' AND address IS NOT NULL)::int   AS unique_users,
          ROUND(COUNT(*) FILTER (WHERE event = 'session_started')::numeric
            / NULLIF(COUNT(DISTINCT address) FILTER (
                WHERE event = 'session_started' AND address IS NOT NULL), 0), 2)
                                                                            AS avg_sessions_per_user,
          ROUND(AVG(
            CASE WHEN event = 'session_ended'
            THEN (properties->>'duration_ms')::numeric / 1000 ELSE NULL END
          ), 1)                                                              AS avg_duration_seconds,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY CASE WHEN event = 'session_ended'
            THEN (properties->>'duration_ms')::numeric / 1000 ELSE NULL END
          ), 1)                                                              AS median_duration_seconds
        FROM analytics_events
        WHERE event IN ('session_started', 'session_ended')
          AND received_at >= NOW() - (${days} || ' days')::interval
      ` as Array<{
        total_sessions: number; unique_users: number
        avg_sessions_per_user: string
        avg_duration_seconds: string | null
        median_duration_seconds: string | null
      }>

      const r = rows[0]
      return res.status(200).json({
        ok:   true,
        days,
        stats: {
          total_sessions:          r?.total_sessions ?? 0,
          unique_users:            r?.unique_users   ?? 0,
          avg_sessions_per_user:   parseFloat(r?.avg_sessions_per_user ?? '0'),
          avg_duration_seconds:    r?.avg_duration_seconds    !== null ? parseFloat(r?.avg_duration_seconds    ?? '0') : null,
          median_duration_seconds: r?.median_duration_seconds !== null ? parseFloat(r?.median_duration_seconds ?? '0') : null,
        },
      })
    }

    // ── daily-challenges ────────────────────────────────────────────────────
    // Successful daily challenges per day + top completers.
    // Body: { days?: number, limit?: number }

    if (action === 'daily-challenges') {
      const rawDays  = typeof body.days  === 'number' ? body.days  : 30
      const rawLimit = typeof body.limit === 'number' ? body.limit : 20
      const days  = Math.min(Math.max(Math.floor(rawDays),  1), 90)
      const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 100)

      const [dailyRows, topRows] = await Promise.all([
        db`
          WITH date_series AS (
            SELECT generate_series(
              (NOW() - (${days} || ' days')::interval)::date,
              NOW()::date,
              '1 day'::interval
            )::date AS day
          )
          SELECT
            d.day::text                                                  AS date,
            COALESCE(COUNT(e.id), 0)::int                               AS completions,
            COUNT(DISTINCT e.address)::int                              AS unique_players
          FROM date_series d
          LEFT JOIN analytics_events e
            ON  e.received_at::date = d.day
            AND e.event = 'daily_win_reward_granted'
          GROUP BY d.day
          ORDER BY d.day ASC
        ` as Promise<Array<{ date: string; completions: number; unique_players: number }>>,

        db`
          SELECT
            address,
            COUNT(*)::int  AS daily_wins
          FROM analytics_events
          WHERE event   = 'daily_win_reward_granted'
            AND address IS NOT NULL
            AND received_at >= NOW() - (${days} || ' days')::interval
          GROUP BY address
          ORDER BY daily_wins DESC
          LIMIT ${limit}
        ` as Promise<Array<{ address: string; daily_wins: number }>>,
      ])

      return res.status(200).json({
        ok:         true,
        days,
        series:     dailyRows,
        top_players: topRows,
      })
    }

    // ── unknown action ──────────────────────────────────────────────────────

    return res.status(404).json({
      error: `Unknown action: "${action}". Valid: overview, daily, retention, sessions, top-players, top-gem-spenders, top-gala-spenders, player-hints, session-stats, daily-challenges`,
    })

  } catch (e: any) {
    console.error(`[admin/analytics/${action}] error:`, e?.message ?? e)
    return res.status(500).json({ error: 'Internal server error', detail: e?.message ?? String(e) })
  }
}
