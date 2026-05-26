// GET /api/analytics/funnel?days=7
// Returns: key conversion funnels for the dashboard.
//
//  1. GALA purchase funnel:  initiated → submitted → success | failed
//  2. Shop conversion:       shop_opened → hint_denied → purchase
//  3. Gameplay funnel:       wallet_connected → level_started → level_completed
//  4. Economy breakdown:     gem spend by reason (pie chart data)
//  5. World popularity:      level_started count by world_id (bar chart)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../_lib/cors.js'
import { sql } from '../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawDays = parseInt((req.query.days as string) ?? '7', 10)
  const days = Math.min(Math.max(rawDays, 1), 90)

  const db = sql()
  const since = db`NOW() - (${days} || ' days')::interval`

  const [galaFunnel, shopFunnel, gameplayFunnel, gemBreakdown, worldPopularity] =
    await Promise.all([

    // ── 1. GALA purchase funnel ─────────────────────────────────────────
    db`
      SELECT
        COUNT(*) FILTER (WHERE event = 'gala_purchase_initiated') AS initiated,
        COUNT(*) FILTER (WHERE event = 'gala_transfer_submitted') AS submitted,
        COUNT(*) FILTER (WHERE event = 'gala_purchase_success')   AS success,
        COUNT(*) FILTER (WHERE event = 'gala_purchase_failed')    AS failed,
        COUNT(*) FILTER (WHERE event = 'gala_gateway_timeout')    AS timeout
      FROM analytics_events
      WHERE event IN (
        'gala_purchase_initiated','gala_transfer_submitted',
        'gala_purchase_success','gala_purchase_failed','gala_gateway_timeout'
      )
      AND received_at >= ${since}
    ` as Promise<Array<{
        initiated: string; submitted: string; success: string
        failed: string; timeout: string
      }>>,

    // ── 2. Shop conversion funnel ────────────────────────────────────────
    db`
      SELECT
        COUNT(*) FILTER (WHERE event = 'shop_opened')                                        AS shop_opened,
        COUNT(*) FILTER (WHERE event = 'hint_denied_no_balance')                             AS hint_denied,
        COUNT(*) FILTER (WHERE event = 'hint_pack_purchased'
          OR (event = 'gem_spent' AND properties->>'reason' = 'hint_pack'))                  AS hint_pack_bought,
        COUNT(*) FILTER (WHERE event = 'gala_purchase_success')                              AS gem_pack_bought
      FROM analytics_events
      WHERE event IN (
        'shop_opened','hint_denied_no_balance','hint_pack_purchased',
        'gem_spent','gala_purchase_success'
      )
      AND received_at >= ${since}
    ` as Promise<Array<{
        shop_opened: string; hint_denied: string
        hint_pack_bought: string; gem_pack_bought: string
      }>>,

    // ── 3. Core gameplay funnel (unique wallets) ─────────────────────────
    db`
      SELECT
        COUNT(DISTINCT address) FILTER (WHERE event = 'wallet_connected') AS connected,
        COUNT(DISTINCT address) FILTER (WHERE event = 'level_started')    AS played,
        COUNT(DISTINCT address) FILTER (WHERE event = 'level_completed')  AS completed
      FROM analytics_events
      WHERE event IN ('wallet_connected','level_started','level_completed')
        AND address IS NOT NULL
        AND received_at >= ${since}
    ` as Promise<Array<{ connected: string; played: string; completed: string }>>,

    // ── 4. Gem spend breakdown by reason ─────────────────────────────────
    db`
      SELECT
        properties->>'reason'                          AS reason,
        COUNT(*)::int                                  AS count,
        COALESCE(SUM((properties->>'amount')::int), 0) AS total_gems
      FROM analytics_events
      WHERE event = 'gem_spent'
        AND received_at >= ${since}
      GROUP BY properties->>'reason'
      ORDER BY total_gems DESC
    ` as Promise<Array<{ reason: string; count: number; total_gems: string }>>,

    // ── 5. World popularity ───────────────────────────────────────────────
    db`
      SELECT
        properties->>'world_id'  AS world_id,
        COUNT(*)::int            AS starts,
        COUNT(*) FILTER (WHERE event = 'level_completed')::int AS completions
      FROM analytics_events
      WHERE event IN ('level_started', 'level_completed')
        AND properties->>'world_id' IS NOT NULL
        AND received_at >= ${since}
      GROUP BY properties->>'world_id'
      ORDER BY starts DESC
      LIMIT 15
    ` as Promise<Array<{ world_id: string; starts: number; completions: number }>>,
  ])

  const gala = galaFunnel[0] ?? {}
  const shop = shopFunnel[0] ?? {}
  const game = gameplayFunnel[0] ?? {}

  return res.status(200).json({
    days,
    gala_purchase_funnel: {
      initiated: parseInt(gala.initiated ?? '0', 10),
      submitted: parseInt(gala.submitted ?? '0', 10),
      success:   parseInt(gala.success   ?? '0', 10),
      failed:    parseInt(gala.failed    ?? '0', 10),
      timeout:   parseInt(gala.timeout   ?? '0', 10),
    },
    shop_funnel: {
      shop_opened:      parseInt(shop.shop_opened      ?? '0', 10),
      hint_denied:      parseInt(shop.hint_denied      ?? '0', 10),
      hint_pack_bought: parseInt(shop.hint_pack_bought ?? '0', 10),
      gem_pack_bought:  parseInt(shop.gem_pack_bought  ?? '0', 10),
    },
    gameplay_funnel: {
      wallets_connected: parseInt(game.connected ?? '0', 10),
      wallets_played:    parseInt(game.played    ?? '0', 10),
      wallets_completed: parseInt(game.completed ?? '0', 10),
    },
    gem_spend_by_reason: gemBreakdown.map(r => ({
      reason:     r.reason,
      count:      r.count,
      total_gems: parseInt(r.total_gems, 10),
    })),
    world_popularity: worldPopularity,
  })
}
