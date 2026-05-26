// Single Vercel function that handles all analytics routes.
// Dispatches on the catch-all `path` segment to stay within the Hobby
// plan's 12-function limit.
//
//   POST /api/analytics/track    — client-side event relay
//   GET  /api/analytics/overview — KPI snapshot
//   GET  /api/analytics/daily    — time-series (DAU, levels, GALA)
//   GET  /api/analytics/funnel   — conversion funnels

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../_lib/cors.js'
import { sql } from '../_lib/db.js'
import { requireAuth } from '../_lib/jwt.js'
import { track } from '../_lib/analytics.js'

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function route(req: VercelRequest): string {
  // req.query path params are unreliable under framework:vite — read from URL.
  // e.g. /api/analytics/overview?days=7  →  'overview'
  const seg = (req.url ?? '').split('?')[0].split('/').filter(Boolean).pop() ?? ''
  return seg.toLowerCase()
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/track
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_EVENTS = new Set([
  'shop_opened',
  'gala_purchase_initiated',
  'world_map_viewed',
  'world_selected',
  'wardrobe_opened',
  'leaderboard_viewed',
  'daily_challenge_opened',
  'session_started',
  'session_ended',
  'wallet_disconnected',
])

async function handleTrack(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { event, properties } = (req.body ?? {}) as {
    event?:      unknown
    properties?: unknown
  }

  if (typeof event !== 'string' || !event.trim()) {
    return res.status(400).json({ error: 'event must be a non-empty string' })
  }
  if (!ALLOWED_EVENTS.has(event)) {
    return res.status(200).json({ ok: true, tracked: false, reason: 'event_not_in_allowlist' })
  }
  if (
    properties !== undefined &&
    (typeof properties !== 'object' || Array.isArray(properties) || properties === null)
  ) {
    return res.status(400).json({ error: 'properties must be an object' })
  }

  let address: string | null = null
  try { address = await requireAuth(req.headers.authorization) } catch {}

  const props: Record<string, unknown> = {
    ...(properties as Record<string, unknown> ?? {}),
    source: 'client',
  }
  if (address) props.address = address

  track(event, props)
  return res.status(200).json({ ok: true, tracked: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/overview
// ─────────────────────────────────────────────────────────────────────────────

async function handleOverview(_req: VercelRequest, res: VercelResponse) {
  const db = sql()

  const [
    dauRow, mauRow, levelsRow, completionRow,
    gemRow, purchaseRow, hintDeniedRow, walletRow,
  ] = await Promise.all([
    db`SELECT COUNT(DISTINCT address)::int AS dau FROM analytics_events
       WHERE received_at >= NOW()::date AND address IS NOT NULL`
      as unknown as Promise<Array<{ dau: number }>>,

    db`SELECT COUNT(DISTINCT address)::int AS mau FROM analytics_events
       WHERE received_at >= NOW() - INTERVAL '30 days' AND address IS NOT NULL`
      as unknown as Promise<Array<{ mau: number }>>,

    db`SELECT
         COUNT(*) FILTER (WHERE event = 'level_started')   AS started,
         COUNT(*) FILTER (WHERE event = 'level_completed') AS completed
       FROM analytics_events WHERE received_at >= NOW()::date`
      as unknown as Promise<Array<{ started: string; completed: string }>>,

    db`SELECT
         COUNT(*) FILTER (WHERE event = 'level_started')   AS started,
         COUNT(*) FILTER (WHERE event = 'level_completed') AS completed
       FROM analytics_events WHERE received_at >= NOW() - INTERVAL '7 days'`
      as unknown as Promise<Array<{ started: string; completed: string }>>,

    db`SELECT COALESCE(SUM((properties->>'amount')::int), 0)::int AS gems_spent
       FROM analytics_events WHERE event = 'gem_spent' AND received_at >= NOW()::date`
      as unknown as Promise<Array<{ gems_spent: number }>>,

    db`SELECT COUNT(*)::int AS purchase_count,
              COALESCE(SUM((properties->>'gala_spent')::numeric), 0) AS gala_total
       FROM analytics_events
       WHERE event = 'gala_purchase_success' AND received_at >= NOW() - INTERVAL '7 days'`
      as unknown as Promise<Array<{ purchase_count: number; gala_total: string }>>,

    db`SELECT COUNT(*)::int AS hint_denied_7d FROM analytics_events
       WHERE event = 'hint_denied_no_balance' AND received_at >= NOW() - INTERVAL '7 days'`
      as unknown as Promise<Array<{ hint_denied_7d: number }>>,

    db`SELECT COUNT(*)::int AS new_wallets FROM analytics_events
       WHERE event = 'wallet_connected'
         AND (properties->>'first_time')::boolean = true
         AND received_at >= NOW()::date`
      as unknown as Promise<Array<{ new_wallets: number }>>,
  ])

  const started7d    = parseInt(completionRow[0]?.started  ?? '0', 10)
  const completed7d  = parseInt(completionRow[0]?.completed ?? '0', 10)
  const completionRate = started7d > 0 ? Math.round((completed7d / started7d) * 100) : null
  const startedToday   = parseInt(levelsRow[0]?.started  ?? '0', 10)
  const completedToday = parseInt(levelsRow[0]?.completed ?? '0', 10)

  return res.status(200).json({
    dau:              dauRow[0]?.dau ?? 0,
    mau:              mauRow[0]?.mau ?? 0,
    new_wallets_today: walletRow[0]?.new_wallets ?? 0,
    levels_started_today:   startedToday,
    levels_completed_today: completedToday,
    completion_rate_7d_pct: completionRate,
    hint_denied_7d:         hintDeniedRow[0]?.hint_denied_7d ?? 0,
    gems_spent_today:   gemRow[0]?.gems_spent ?? 0,
    gala_purchases_7d:  purchaseRow[0]?.purchase_count ?? 0,
    gala_total_7d:      parseFloat(purchaseRow[0]?.gala_total ?? '0'),
    as_of: new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/daily?days=30
// ─────────────────────────────────────────────────────────────────────────────

async function handleDaily(req: VercelRequest, res: VercelResponse) {
  const rawDays = parseInt((req.query.days as string) ?? '30', 10)
  const days = Math.min(Math.max(rawDays, 1), 90)
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
      CASE WHEN COALESCE(e.levels_started, 0) > 0
        THEN ROUND(e.levels_completed::numeric / e.levels_started * 100, 1)
        ELSE NULL
      END                                                  AS completion_rate_pct
    FROM date_series d
    LEFT JOIN daily_events e ON e.day = d.day
    ORDER BY d.day ASC
  ` as Array<{
    date: string; dau: number; new_wallets: number
    levels_started: number; levels_completed: number
    words_rejected: number; hint_denied: number
    gala_purchases: number; gala_spent: string
    daily_completions: number; shop_opens: number
    completion_rate_pct: string | null
  }>

  return res.status(200).json({
    days,
    series: rows.map(r => ({
      ...r,
      gala_spent:          parseFloat(r.gala_spent),
      completion_rate_pct: r.completion_rate_pct !== null ? parseFloat(r.completion_rate_pct) : null,
    })),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/funnel?days=7
// ─────────────────────────────────────────────────────────────────────────────

async function handleFunnel(req: VercelRequest, res: VercelResponse) {
  const rawDays = parseInt((req.query.days as string) ?? '7', 10)
  const days = Math.min(Math.max(rawDays, 1), 90)
  const db = sql()
  const since = db`NOW() - (${days} || ' days')::interval`

  const [galaFunnel, shopFunnel, gameplayFunnel, gemBreakdown, worldPopularity] =
    await Promise.all([
      db`SELECT
           COUNT(*) FILTER (WHERE event = 'gala_purchase_initiated') AS initiated,
           COUNT(*) FILTER (WHERE event = 'gala_transfer_submitted') AS submitted,
           COUNT(*) FILTER (WHERE event = 'gala_purchase_success')   AS success,
           COUNT(*) FILTER (WHERE event = 'gala_purchase_failed')    AS failed,
           COUNT(*) FILTER (WHERE event = 'gala_gateway_timeout')    AS timeout
         FROM analytics_events
         WHERE event IN (
           'gala_purchase_initiated','gala_transfer_submitted',
           'gala_purchase_success','gala_purchase_failed','gala_gateway_timeout'
         ) AND received_at >= ${since}`
        as unknown as Promise<Array<{
          initiated: string; submitted: string; success: string; failed: string; timeout: string
        }>>,

      db`SELECT
           COUNT(*) FILTER (WHERE event = 'shop_opened')                             AS shop_opened,
           COUNT(*) FILTER (WHERE event = 'hint_denied_no_balance')                  AS hint_denied,
           COUNT(*) FILTER (WHERE event = 'hint_pack_purchased'
             OR (event = 'gem_spent' AND properties->>'reason' = 'hint_pack'))       AS hint_pack_bought,
           COUNT(*) FILTER (WHERE event = 'gala_purchase_success')                   AS gem_pack_bought
         FROM analytics_events
         WHERE event IN (
           'shop_opened','hint_denied_no_balance','hint_pack_purchased',
           'gem_spent','gala_purchase_success'
         ) AND received_at >= ${since}`
        as unknown as Promise<Array<{
          shop_opened: string; hint_denied: string; hint_pack_bought: string; gem_pack_bought: string
        }>>,

      db`SELECT
           COUNT(DISTINCT address) FILTER (WHERE event = 'wallet_connected') AS connected,
           COUNT(DISTINCT address) FILTER (WHERE event = 'level_started')    AS played,
           COUNT(DISTINCT address) FILTER (WHERE event = 'level_completed')  AS completed
         FROM analytics_events
         WHERE event IN ('wallet_connected','level_started','level_completed')
           AND address IS NOT NULL AND received_at >= ${since}`
        as unknown as Promise<Array<{ connected: string; played: string; completed: string }>>,

      db`SELECT
           properties->>'reason'                           AS reason,
           COUNT(*)::int                                   AS count,
           COALESCE(SUM((properties->>'amount')::int), 0)  AS total_gems
         FROM analytics_events
         WHERE event = 'gem_spent' AND received_at >= ${since}
         GROUP BY properties->>'reason'
         ORDER BY total_gems DESC`
        as unknown as Promise<Array<{ reason: string; count: number; total_gems: string }>>,

      db`SELECT
           properties->>'world_id'  AS world_id,
           COUNT(*)::int            AS starts,
           COUNT(*) FILTER (WHERE event = 'level_completed')::int AS completions
         FROM analytics_events
         WHERE event IN ('level_started','level_completed')
           AND properties->>'world_id' IS NOT NULL
           AND received_at >= ${since}
         GROUP BY properties->>'world_id'
         ORDER BY starts DESC LIMIT 15`
        as unknown as Promise<Array<{ world_id: string; starts: number; completions: number }>>,
    ])

  const gala = galaFunnel[0]
  const shop = shopFunnel[0]
  const game = gameplayFunnel[0]

  return res.status(200).json({
    days,
    gala_purchase_funnel: {
      initiated: parseInt(gala?.initiated ?? '0', 10),
      submitted: parseInt(gala?.submitted ?? '0', 10),
      success:   parseInt(gala?.success   ?? '0', 10),
      failed:    parseInt(gala?.failed    ?? '0', 10),
      timeout:   parseInt(gala?.timeout   ?? '0', 10),
    },
    shop_funnel: {
      shop_opened:      parseInt(shop?.shop_opened      ?? '0', 10),
      hint_denied:      parseInt(shop?.hint_denied      ?? '0', 10),
      hint_pack_bought: parseInt(shop?.hint_pack_bought ?? '0', 10),
      gem_pack_bought:  parseInt(shop?.gem_pack_bought  ?? '0', 10),
    },
    gameplay_funnel: {
      wallets_connected: parseInt(game?.connected ?? '0', 10),
      wallets_played:    parseInt(game?.played    ?? '0', 10),
      wallets_completed: parseInt(game?.completed ?? '0', 10),
    },
    gem_spend_by_reason: gemBreakdown.map(r => ({
      reason:     r.reason,
      count:      r.count,
      total_gems: parseInt(r.total_gems, 10),
    })),
    world_popularity: worldPopularity,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  switch (route(req)) {
    case 'track':    return handleTrack(req, res)
    case 'overview': return handleOverview(req, res)
    case 'daily':    return handleDaily(req, res)
    case 'funnel':   return handleFunnel(req, res)
    default:
      return res.status(404).json({ error: `Unknown analytics route: ${route(req)}` })
  }
}
