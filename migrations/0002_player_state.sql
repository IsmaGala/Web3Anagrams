-- ─────────────────────────────────────────────────────────────────────────────
-- NFT WordChain · v3 schema — cross-device profile sync
--
-- One row per wallet address; the payload is a JSONB blob containing every
-- piece of progression the client tracks locally (economy, world progress,
-- premium unlocks, event state, daily attempt). We keep it as a single blob
-- so the client can ship new state buckets without requiring a DB migration.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_state (
  address     TEXT PRIMARY KEY,
  payload     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional — speeds up "all players updated in the last hour" queries if we
-- ever build an admin dashboard. Cheap to add now, expensive to add later
-- after the table has rows.
CREATE INDEX IF NOT EXISTS player_state_updated_at_idx
  ON player_state(updated_at DESC);
