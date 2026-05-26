// GET /api/analytics/overview
// Headers: Authorization: Bearer <jwt>  (optional — any valid JWT gates this)
// Returns: KPI snapshot for the company dashboard.
//
// Intended to be proxied by the dashboard's Express server and consumed
// by a KPI card row. All numbers are computed from the analytics_events table.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../_lib/cors.js'
import { sql } from '../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const db = sql()

  // All queries run in parallel — the dashboard needs this to feel instant.
  const [
    dauRow,
    mauRow,
    levelsRow,
    completionRow,
    gemRow,
    purchaseRow,
    hintDeniedRow,
    walletRow,
  ] = await Promise.all([
    // DAU — unique wallets with any event today (UTC)
    db`
      SELECT COUNT(DISTINCT address)::int AS dau
        FROM analytics_events
       WHERE received_at >= NOW()::date
         AND address IS NOT NULL
    ` as unknown as Promise<Array<{ dau: number }>>,

    // MAU — unique wallets in the last 30 days
    db`
      SELECT COUNT(DISTINCT address)::int AS mau
        FROM analytics_events
       WHERE received_at >= NOW() - INTERVAL '30 days'
         AND address IS NOT NULL
    ` as unknown as Promise<Array<{ mau: number }>>,

    // Levels started and completed today
    db`
      SELECT
        COUNT(*) FILTER (WHERE event = 'level_started')   AS started,
        COUNT(*) FILTER (WHERE event = 'level_completed') AS completed
        FROM analytics_events
       WHERE received_at >= NOW()::date
    ` as unknown as Promise<Array<{ started: string; completed: string }>>,

    // All-time level completion rate (last 7 days for relevance)
    db`
      SELECT
        COUNT(*) FILTER (WHERE event = 'level_started')   AS started,
        COUNT(*) FILTER (WHERE event = 'level_completed') AS completed
        FROM analytics_events
       WHERE received_at >= NOW() - INTERVAL '7 days'
    ` as unknown as Promise<Array<{ started: string; completed: string }>>,

    // Gems spent today (all reasons)
    db`
      SELECT COALESCE(SUM((properties->>'amount')::int), 0)::int AS gems_spent
        FROM analytics_events
       WHERE event = 'gem_spent'
         AND received_at >= NOW()::date
    ` as unknown as Promise<Array<{ gems_spent: number }>>,

    // GALA purchases — count and total GALA last 7 days
    db`
      SELECT
        COUNT(*)::int                                          AS purchase_count,
        COALESCE(SUM((properties->>'gala_spent')::numeric), 0) AS gala_total
        FROM analytics_events
       WHERE event = 'gala_purchase_success'
         AND received_at >= NOW() - INTERVAL '7 days'
    ` as unknown as Promise<Array<{ purchase_count: number; gala_total: string }>>,

    // Hint denied (shop conversion pressure) — last 7 days
    db`
      SELECT COUNT(*)::int AS hint_denied_7d
        FROM analytics_events
       WHERE event = 'hint_denied_no_balance'
         AND received_at >= NOW() - INTERVAL '7 days'
    ` as unknown as Promise<Array<{ hint_denied_7d: number }>>,

    // New wallets today (first ever wallet_connected)
    db`
      SELECT COUNT(*)::int AS new_wallets
        FROM analytics_events
       WHERE event = 'wallet_connected'
         AND (properties->>'first_time')::boolean = true
         AND received_at >= NOW()::date
    ` as unknown as Promise<Array<{ new_wallets: number }>>,
  ])

  const started7d  = parseInt(completionRow[0]?.started  ?? '0', 10)
  const completed7d = parseInt(completionRow[0]?.completed ?? '0', 10)
  const completionRate = started7d > 0
    ? Math.round((completed7d / started7d) * 100)
    : null

  const startedToday   = parseInt(levelsRow[0]?.started  ?? '0', 10)
  const completedToday = parseInt(levelsRow[0]?.completed ?? '0', 10)

  return res.status(200).json({
    // Retention
    dau:              dauRow[0]?.dau ?? 0,
    mau:              mauRow[0]?.mau ?? 0,
    new_wallets_today: walletRow[0]?.new_wallets ?? 0,

    // Gameplay (today)
    levels_started_today:   startedToday,
    levels_completed_today: completedToday,

    // Gameplay health (7-day rolling)
    completion_rate_7d_pct: completionRate,
    hint_denied_7d:         hintDeniedRow[0]?.hint_denied_7d ?? 0,

    // Economy
    gems_spent_today:   gemRow[0]?.gems_spent ?? 0,
    gala_purchases_7d:  purchaseRow[0]?.purchase_count ?? 0,
    gala_total_7d:      parseFloat(purchaseRow[0]?.gala_total ?? '0'),

    as_of: new Date().toISOString(),
  })
}
