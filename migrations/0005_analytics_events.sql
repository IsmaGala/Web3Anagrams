-- ─────────────────────────────────────────────────────────────────────────────
-- NFT WordChain · v6 schema — analytics events
--
-- Append-only table that receives every tracked event from the game.
-- This is the dashboard-agnostic source of truth: even before a specific
-- analytics service (Mixpanel, Amplitude, PostHog, …) is chosen, all events
-- are persisted here so no data is lost.
--
-- The `properties` JSONB column holds the full event payload. Each event
-- type defines its own shape (documented in wordchain_analytics_event_spec.xlsx).
-- Common top-level keys present on every event:
--   address      — wallet address (lowercase 0x…), null for pre-login events
--   timestamp_utc — ISO-8601 string set by the server at ingestion time
--   app_version  — from VITE_APP_VERSION env / package.json
--   source       — 'server' | 'client'
--
-- Paste-and-run in the Neon SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_events (
  id           BIGSERIAL PRIMARY KEY,
  event        TEXT        NOT NULL,
  -- Denormalised for fast per-player lookups without a JSONB extract.
  address      TEXT,
  properties   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-player event history (most common dashboard query).
CREATE INDEX IF NOT EXISTS analytics_events_address_idx
  ON analytics_events(address, received_at DESC)
  WHERE address IS NOT NULL;

-- Per-event-type aggregation (DAU, funnel counts, etc.).
CREATE INDEX IF NOT EXISTS analytics_events_event_received_idx
  ON analytics_events(event, received_at DESC);

-- GIN index for ad-hoc JSONB property filtering
-- (e.g. WHERE properties->>'world_id' = 'asimov').
-- Create only if you expect heavy dashboard use; skip for low-traffic deploys.
-- CREATE INDEX IF NOT EXISTS analytics_events_properties_gin_idx
--   ON analytics_events USING GIN (properties);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sanity-check queries (run after first events arrive):
--
--   SELECT event, count(*) FROM analytics_events GROUP BY event ORDER BY count DESC;
--
--   SELECT * FROM analytics_events ORDER BY received_at DESC LIMIT 20;
--
--   -- DAU for today
--   SELECT count(DISTINCT address) FROM analytics_events
--     WHERE received_at >= NOW()::date AND address IS NOT NULL;
--
--   -- Completion funnel
--   SELECT
--     count(*) FILTER (WHERE event = 'level_started')   AS started,
--     count(*) FILTER (WHERE event = 'level_completed') AS completed
--   FROM analytics_events WHERE received_at > NOW() - INTERVAL '24h';
-- ─────────────────────────────────────────────────────────────────────────────
