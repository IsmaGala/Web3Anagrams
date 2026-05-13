-- ─────────────────────────────────────────────────────────────────────────────
-- NFT WordChain · v2 schema
--
-- Paste-and-run in the Neon SQL Editor. Idempotent (uses IF NOT EXISTS).
-- See docs/deploy/VERCEL.md §V2 for full onboarding steps.
-- ─────────────────────────────────────────────────────────────────────────────

-- One-time login nonces. Keyed by lowercased 0x address.
-- TTL ≈ 5 minutes; rows older than that are stale and ignored on verify.
CREATE TABLE IF NOT EXISTS nonces (
  address     TEXT PRIMARY KEY,
  nonce       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Periodic cleanup so the table doesn't grow forever.
-- Neon doesn't run cron automatically; the auth/verify path opportunistically
-- deletes its own row on success, and a background sweep can be scheduled if
-- needed later.
CREATE INDEX IF NOT EXISTS nonces_expires_at_idx ON nonces(expires_at);

-- Leaderboard scores. One row per (address, event, week).
-- We UPSERT and keep the best score for the week so the leaderboard ranks by
-- player-best, not last-attempt.
CREATE TABLE IF NOT EXISTS scores (
  id          BIGSERIAL PRIMARY KEY,
  address     TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  week_id     INTEGER NOT NULL,
  score       INTEGER NOT NULL CHECK (score >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS scores_addr_event_week_uniq
  ON scores(address, event_id, week_id);

-- Used by the ranked SELECT — Postgres can serve top-N + RANK() from this.
CREATE INDEX IF NOT EXISTS scores_event_week_score_idx
  ON scores(event_id, week_id, score DESC);

-- Optional player profiles — display name shown on the leaderboard. Wallet
-- address is still the canonical identity; this is purely cosmetic.
CREATE TABLE IF NOT EXISTS profiles (
  address       TEXT PRIMARY KEY,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sanity-check queries you can run after creating the tables:
--
--   SELECT count(*) FROM nonces;
--   SELECT count(*) FROM scores;
--   SELECT count(*) FROM profiles;
--
-- All three should return 0 on a fresh DB.
-- ─────────────────────────────────────────────────────────────────────────────
