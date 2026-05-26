// POST /api/analytics/track
// Body:    { event: string, properties?: object }
// Headers: Authorization: Bearer <jwt>  (optional — enriches address)
//
// Client-side event relay. The client calls this instead of a SaaS SDK
// directly for two reasons:
//   1. Ad-blockers can't block a first-party endpoint.
//   2. The wallet address from the JWT is authoritative — the client can't
//      spoof a different address in properties.
//
// The endpoint reads the address from the JWT when present and injects it
// into the event properties before forwarding to analytics.track().
// Events from unauthenticated players (pre-wallet-connect) are accepted
// without a JWT; address will be null in those rows.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from '../_lib/cors.js'
import { requireAuth } from '../_lib/jwt.js'
import { track } from '../_lib/analytics.js'

// Client-side event allowlist — prevents the endpoint from being abused
// to write arbitrary events. Add events here as you instrument them.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
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
    // Silently accept unknown events in production to avoid breaking the
    // client, but don't track them (prevents log pollution from bugs).
    return res.status(200).json({ ok: true, tracked: false, reason: 'event_not_in_allowlist' })
  }
  if (properties !== undefined && (typeof properties !== 'object' || Array.isArray(properties) || properties === null)) {
    return res.status(400).json({ error: 'properties must be an object' })
  }

  // JWT is optional — unauthenticated events (e.g. shop_opened before wallet
  // connect) are still valuable. requireAuth returns null without throwing
  // when the header is absent.
  let address: string | null = null
  try {
    address = await requireAuth(req.headers.authorization)
  } catch {}

  const props: Record<string, unknown> = {
    ...(properties as Record<string, unknown> ?? {}),
    source: 'client',
  }
  if (address) props.address = address

  // Fire-and-forget — the client gets a 200 immediately.
  track(event, props)

  return res.status(200).json({ ok: true, tracked: true })
}
