// GET /api/analytics/daily?days=30
// Returns: time-series array for dashboard charts.
// Each entry = one UTC calendar day.
// Used by AreaChart (DAU over time), BarChart (levels/day), and
// the GALA revenue trend line.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../_lib/cors.js'
import { sql } from '../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawDays = parseInt((req.query.days as string) ?? '30', 10)
  const days = Math.min(Math.max(rawDays, 1), 90)  // clamp 1–90

  const db = sql()

  const rows = await db`
    WITH date_series AS (
      SELECT generate_series(
        (NOW() - (${days} || ' days')::interval)::date,
        NOW()::date,
        '1 day'::interval
      )::date AS day
    ),
    daily_events AS (
      SELECT
        received_at::date                                             AS day,
        COUNT(DISTINCT address) FILTER (WHERE address IS NOT NULL)    AS dau,
        COUNT(*) FILTER (WHERE event = 'level_started')               AS levels_started,
        COUNT(*) FILTER (WHERE event = 'level_completed')             AS levels_completed,
        COUNT(*) FILTER (WHERE event = 'word_rejected')               AS words_rejected,
        COUNT(*) FILTER (WHERE event = 'hint_denied_no_balance')      AS hint_denied,
        COUNT(*) FILTER (WHERE event = 'wallet_connected'
          AND (properties->>'first_time')::boolean = true)            AS new_wallets,
        COUNT(*) FILTER (WHERE event = 'gala_purchase_success')       AS gala_purchases,
        COALESCE(SUM(
          CASE WHEN event = 'gala_purchase_success'
          THEN (properties->>'gala_spent')::numeric ELSE 0 END
        ), 0)                                                          AS gala_spent,
        COUNT(*) FILTER (WHERE event = 'daily_challenge_completed')   AS daily_completions,
        COUNT(*) FILTER (WHERE event = 'shop_opened')                 AS shop_opens
      FROM analytics_events
      WHERE received_at >= (NOW() - (${days} || ' days')::interval)::date
      GROUP BY received_at::date
    )
    SELECT
      d.day::text                                          AS date,
      COALESCE(e.dau, 0)::int                             AS dau,
      COALESCE(e.new_wallets, 0)::int                     AS new_wallets,
      COALESCE(e.levels_started, 0)::int                  AS levels_started,
      COALESCE(e.levels_completed, 0)::int                AS levels_completed,
      COALESCE(e.words_rejected, 0)::int                  AS words_rejected,
      COALESCE(e.hint_denied, 0)::int                     AS hint_denied,
      COALESCE(e.gala_purchases, 0)::int                  AS gala_purchases,
      COALESCE(e.gala_spent, 0)::numeric                  AS gala_spent,
      COALESCE(e.daily_completions, 0)::int               AS daily_completions,
      COALESCE(e.shop_opens, 0)::int                      AS shop_opens,
      -- Completion rate % (null when no levels started)
      CASE WHEN COALESCE(e.levels_started, 0) > 0
        THEN ROUND(e.levels_completed::numeric / e.levels_started * 100, 1)
        ELSE NULL
      END                                                  AS completion_rate_pct
    FROM date_series d
    LEFT JOIN daily_events e ON e.day = d.day
    ORDER BY d.day ASC
  ` as Array<{
    date:               string
    dau:                number
    new_wallets:        number
    levels_started:     number
    levels_completed:   number
    words_rejected:     number
    hint_denied:        number
    gala_purchases:     number
    gala_spent:         string
    daily_completions:  number
    shop_opens:         number
    completion_rate_pct: string | null
  }>

  return res.status(200).json({
    days,
    series: rows.map(r => ({
      ...r,
      gala_spent:          parseFloat(r.gala_spent),
      completion_rate_pct: r.completion_rate_pct !== null
        ? parseFloat(r.completion_rate_pct)
        : null,
    })),
  })
}
