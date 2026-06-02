-- ─────────────────────────────────────────────────────────────────────────────
-- NFT WordChain · v7 schema — Discord identity linking
--
-- Optional table. One row per wallet address that has linked their Discord
-- account via OAuth2. The link is voluntary; players without a row continue
-- to appear on the leaderboard with their truncated wallet address.
--
-- What we store (minimal):
--   discord_id      — snowflake needed to build the CDN avatar URL
--   discord_handle  — global_name with username fallback (display name)
--   discord_avatar  — avatar hash only; full URL is constructed at render time:
--                     https://cdn.discordapp.com/avatars/{discord_id}/{discord_avatar}.png
--
-- What we deliberately do NOT store:
--   • OAuth access tokens  (discarded immediately after the one-time fetch)
--   • OAuth refresh tokens
--   • Email
--   • Guild memberships
--
-- Scope used: identify (no email, no guilds, no bot required)
--
-- Idempotent — safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discord_connections (
  address         TEXT        PRIMARY KEY,   -- wallet address (FK to nonces / player_balances)
  discord_id      TEXT        NOT NULL,      -- Discord snowflake ID
  discord_handle  TEXT        NOT NULL,      -- global_name ?? username
  discord_avatar  TEXT,                      -- avatar hash, NULL if user has no custom avatar
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup from leaderboard JOIN (address is PK so indexed automatically,
-- but an explicit note here clarifies intent for future maintainers).
-- The leaderboard query does:
--   LEFT JOIN discord_connections dc USING (address)
-- so no additional index is needed beyond the PK.

-- ─────────────────────────────────────────────────────────────────────────────
-- Sanity-check queries:
--   SELECT count(*) FROM discord_connections;
--   SELECT address, discord_handle, discord_avatar IS NOT NULL AS has_avatar
--     FROM discord_connections LIMIT 10;
-- ─────────────────────────────────────────────────────────────────────────────
