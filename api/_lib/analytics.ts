// ─────────────────────────────────────────────────────────────────────────────
// Analytics — server-side event tracking.
//
// USAGE
//   import { track } from './_lib/analytics.js'
//   track('level_completed', { address, round_id, final_score, ... })
//
// DESIGN
//   • Fire-and-forget: track() never throws and never awaits on the
//     calling endpoint's response path. A slow DB or a misconfigured
//     webhook never delays gameplay.
//   • Dual-write: events go to the local `analytics_events` Postgres
//     table (always) and optionally to a SaaS webhook (Segment, Mixpanel,
//     PostHog, or any custom endpoint) when ANALYTICS_WEBHOOK_URL is set.
//   • Dashboard-agnostic: when you pick a service, set the two env vars
//     below and the data starts flowing — no code changes needed.
//
// ENV VARS (all optional — analytics degrades gracefully when absent)
//   ANALYTICS_WEBHOOK_URL   — full URL to POST events to
//                             Segment:  https://api.segment.io/v1/track
//                             Mixpanel: https://api.mixpanel.com/track
//                             PostHog:  https://app.posthog.com/capture/
//                             Custom:   any HTTPS endpoint
//   ANALYTICS_WRITE_KEY     — API key / write key sent as Bearer token
//                             (or as Authorization header)
//   ANALYTICS_PROVIDER      — 'segment' | 'mixpanel' | 'posthog' | 'raw'
//                             Controls how the payload is shaped.
//                             Defaults to 'raw' (our own JSON schema).
//
// DATABASE
//   Requires the analytics_events table from migrations/0005_analytics_events.sql.
//   Falls back silently if DATABASE_URL is missing (local dev without DB).
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from './db.js'

// ── Shared properties attached to every event ─────────────────────────────

const APP_VERSION = process.env.npm_package_version
  ?? process.env.VITE_APP_VERSION
  ?? 'unknown'

// ── Core track function ───────────────────────────────────────────────────

/**
 * Fire-and-forget event tracking. Safe to call from any endpoint — it
 * never throws and never blocks the response.
 *
 * @param event      — snake_case event name, e.g. 'level_completed'
 * @param properties — event-specific payload; include `address` for
 *                     per-player attribution
 */
export function track(
  event:      string,
  properties: Record<string, unknown>,
): void {
  // Intentionally not awaited — errors are swallowed after logging.
  _track(event, properties).catch(err => {
    console.error('[analytics] track error:', err?.message ?? err)
  })
}

async function _track(
  event:      string,
  properties: Record<string, unknown>,
): Promise<void> {
  const address       = typeof properties.address === 'string' ? properties.address : null
  const timestamp_utc = new Date().toISOString()

  const payload: Record<string, unknown> = {
    ...properties,
    timestamp_utc,
    app_version: APP_VERSION,
    source:      'server',
  }

  // ── 1. Persist to local Postgres ─────────────────────────────────────
  await persistToDb(event, address, payload)

  // ── 2. Forward to SaaS webhook (if configured) ───────────────────────
  const webhookUrl = process.env.ANALYTICS_WEBHOOK_URL
  if (webhookUrl) {
    await forwardToWebhook(webhookUrl, event, address, payload)
  }
}

// ── DB persistence ────────────────────────────────────────────────────────

async function persistToDb(
  event:    string,
  address:  string | null,
  payload:  Record<string, unknown>,
): Promise<void> {
  try {
    const db = sql()
    await db`
      INSERT INTO analytics_events (event, address, properties)
      VALUES (${event}, ${address}, ${JSON.stringify(payload)}::jsonb)
    `
  } catch (err: any) {
    // Non-fatal — DB might be unreachable in local dev without DATABASE_URL.
    console.warn('[analytics] DB write failed:', err?.message ?? err)
  }
}

// ── Webhook forwarding ────────────────────────────────────────────────────

type Provider = 'segment' | 'mixpanel' | 'posthog' | 'raw'

async function forwardToWebhook(
  url:      string,
  event:    string,
  address:  string | null,
  payload:  Record<string, unknown>,
): Promise<void> {
  const writeKey = process.env.ANALYTICS_WRITE_KEY ?? ''
  const provider = (process.env.ANALYTICS_PROVIDER ?? 'raw') as Provider

  let body: string
  let headers: Record<string, string> = { 'Content-Type': 'application/json' }

  switch (provider) {
    // ── Segment ──────────────────────────────────────────────────────────
    // https://segment.com/docs/connections/sources/catalog/libraries/server/http-api/#track
    case 'segment':
      body = JSON.stringify({
        writeKey,
        userId:     address ?? 'anonymous',
        anonymousId: address ? undefined : crypto.randomUUID(),
        event,
        properties: payload,
        timestamp:  payload.timestamp_utc,
        context:    { library: { name: 'nft-wordchain-server', version: APP_VERSION } },
      })
      // Segment uses HTTP Basic auth: writeKey as username, empty password.
      headers['Authorization'] = 'Basic ' + Buffer.from(writeKey + ':').toString('base64')
      break

    // ── Mixpanel ─────────────────────────────────────────────────────────
    // https://developer.mixpanel.com/reference/track-event
    case 'mixpanel':
      body = JSON.stringify([{
        event,
        properties: {
          ...payload,
          distinct_id: address ?? 'anonymous',
          token:       writeKey,
          time:        Math.floor(Date.now() / 1000),
          $insert_id:  crypto.randomUUID(),
        },
      }])
      break

    // ── PostHog ───────────────────────────────────────────────────────────
    // https://posthog.com/docs/api/capture
    case 'posthog':
      body = JSON.stringify({
        api_key:      writeKey,
        event,
        distinct_id:  address ?? 'anonymous',
        properties:   payload,
        timestamp:    payload.timestamp_utc,
      })
      break

    // ── Raw / custom ─────────────────────────────────────────────────────
    // Sends our own schema. Any custom endpoint (e.g. internal data pipeline)
    // can parse this directly.
    default:
      body = JSON.stringify({ event, properties: payload })
      if (writeKey) headers['Authorization'] = `Bearer ${writeKey}`
      break
  }

  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers,
      body,
      signal:  AbortSignal.timeout(5_000),  // never block for more than 5s
    })
    if (!resp.ok) {
      console.warn(`[analytics] webhook ${provider} returned HTTP ${resp.status} for event "${event}"`)
    }
  } catch (err: any) {
    console.warn(`[analytics] webhook forward failed for "${event}":`, err?.message ?? err)
  }
}
