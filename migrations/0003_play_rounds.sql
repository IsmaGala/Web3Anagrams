-- ─────────────────────────────────────────────────────────────────────────────
-- NFT WordChain · v4 schema — server-authoritative gameplay rounds
--
-- Backing store for /api/play/level/* endpoints. Each round is one attempt
-- at one level; the row is the canonical source of truth for:
--   • which words have been found (no client-asserted completion)
--   • which letter positions have been hint-revealed (no client-asserted hints)
--   • miss count, start time, end time (no client-asserted breakdown)
--
-- Closes the four critical cheat vectors in one table:
--   1. Answer keys never leave the server — endpoint reads `level_index`
--      and resolves words via api/_data/levels/, never returning them.
--   2. Hints become a per-round mutation — the server picks the slot and
--      letter and decrements the player's hint balance atomically.
--   3. Level completion is detected server-side from `found_words`.
--   4. Score breakdown is computed server-side from this row's data.
--
-- Paste-and-run in the Neon SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS play_rounds (
  -- Opaque round ID. ULID-ish — generated server-side, returned to the
  -- client, and passed back on every action. We sign it with the JWT secret
  -- in transit (see _lib/round.ts) so even if a client guesses one, they
  -- can't act on it.
  round_id          TEXT PRIMARY KEY,

  -- Wallet address from the JWT. We never trust client-supplied address.
  address           TEXT NOT NULL,

  -- The level being played. (world_id, level_index) resolves to a Level
  -- entry in api/_data/levels/<worldId>Levels.ts.
  world_id          TEXT NOT NULL,
  level_index       INTEGER NOT NULL,
  mode              TEXT NOT NULL CHECK (mode IN ('single','daily')),

  -- Wheel letters as shown to the player this round (shuffled per round so
  -- the order doesn't betray the long word). Stored so we can replay/audit
  -- a round after the fact.
  shuffled_letters  JSONB NOT NULL,

  -- Mutable round state ----------------------------------------------------
  -- Words the player has correctly submitted so far. JSONB array of strings.
  found_words       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Bonus words found (separate so the breakdown can score them differently
  -- and so completion detection only checks primaries).
  found_bonus       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Hints already issued for this round. Each entry is
  --   { "len": number, "ordinal": number, "position": number, "letter": "X" }
  -- Stored as JSONB so the schema can evolve without a migration.
  hints_revealed    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Number of invalid submissions ("not in chain"). Feeds the breakdown.
  misses            INTEGER NOT NULL DEFAULT 0,

  -- Lifecycle --------------------------------------------------------------
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set on the submission that fills the last slot. NULL while in-progress.
  completed_at      TIMESTAMPTZ,
  -- Server-computed final score. NULL until completed_at is set.
  final_score       INTEGER
);

-- An address typically has at most one IN-PROGRESS round at a time, but a
-- player can replay completed levels for a better breakdown, so we don't
-- enforce uniqueness on (address, world_id, level_index). We index it so
-- "what's the latest round for this player on this level?" is fast.
CREATE INDEX IF NOT EXISTS play_rounds_player_level_idx
  ON play_rounds(address, world_id, level_index, started_at DESC);

-- Cleanup helper for ops: abandoned in-progress rounds older than N days.
CREATE INDEX IF NOT EXISTS play_rounds_abandoned_idx
  ON play_rounds(started_at)
  WHERE completed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Server-authoritative balances
--
-- Today the client owns gems + hints (stored in localStorage `wc_economy_v1`,
-- mirrored to `player_state.payload.economy`). That makes both editable from
-- DevTools, which defeats the point of validating hints on the server.
--
-- This table is the future home of authoritative economy state. We seed it
-- below from any existing player_state row so no one loses their balance on
-- the cutover; from here on the server is the only writer for `hints_balance`
-- (deducted by /api/play/level/hint, credited by daily wins / shop purchases).
-- `gems_balance` is included now so the next milestone (server-authoritative
-- gem economy) doesn't require a second migration, but is not yet enforced
-- as authoritative for spends — that's deferred to migration 0004 + matching
-- endpoint work.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_balances (
  address       TEXT PRIMARY KEY,
  gems_balance  INTEGER NOT NULL DEFAULT 0  CHECK (gems_balance  >= 0),
  hints_balance INTEGER NOT NULL DEFAULT 3  CHECK (hints_balance >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-shot seed from existing player_state rows. Safe to run multiple times
-- thanks to ON CONFLICT DO NOTHING — only the FIRST run sets the value.
-- Subsequent server writes to player_balances are the only source of truth.
INSERT INTO player_balances (address, gems_balance, hints_balance)
SELECT
  address,
  COALESCE((payload->'economy'->>'gemsBalance')::int, 0),
  COALESCE((payload->'economy'->>'hints')::int, 3)
FROM player_state
ON CONFLICT (address) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sanity-check queries:
--   SELECT count(*) FROM play_rounds;
--   SELECT count(*) FROM play_rounds WHERE completed_at IS NULL;
--   SELECT count(*) FROM player_balances;
-- ─────────────────────────────────────────────────────────────────────────────
