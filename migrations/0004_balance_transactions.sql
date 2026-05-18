-- ─────────────────────────────────────────────────────────────────────────────
-- NFT WordChain · v5 schema — server-authoritative economy transactions
--
-- Append-only audit trail for every change to `player_balances.gems_balance`
-- and `player_balances.hints_balance`. The balances column itself is still
-- the source of truth; this table is for forensics ("how did this account
-- gain 10k gems overnight?"), support ("did the player actually get the
-- world-completion bounty?"), and debugging ("which endpoint debited gems
-- here?").
--
-- We log gems AND hints in the same table so a single row covers compound
-- transactions like "buy hint pack: -200 gems, +5 hints". One of the deltas
-- can be 0 if the transaction only moved one balance.
--
-- Paste-and-run in the Neon SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS balance_transactions (
  id           BIGSERIAL PRIMARY KEY,
  address      TEXT NOT NULL,
  gems_delta   INTEGER NOT NULL DEFAULT 0,
  hints_delta  INTEGER NOT NULL DEFAULT 0,
  -- Reason codes — kept open-ended (no enum) so new spend/earn sites can be
  -- added without a migration. Recognized values today:
  --   spends:  'hint_pack' | 'unlock_premium' | 'unlock_event'
  --          | 'daily_retry' | 'cosmetic_skin'
  --   grants:  'level_complete' | 'world_completion_bounty'
  --          | 'daily_win' | 'first_wallet_bonus' | 'store_purchase'
  --   adjust:  'admin_correction' | 'support_refund'
  reason       TEXT NOT NULL,
  -- Free-form metadata. For unlock_premium → {"worldId":"asimov"}; for
  -- hint_pack → {"packId":"pack_3","hints":5}; for store_purchase →
  -- {"packId":"...","tx":"..."}. Indexable via GIN if it ever matters.
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Sanity: at least one of the deltas must be non-zero (no empty rows).
  CONSTRAINT  balance_tx_nonzero CHECK (gems_delta <> 0 OR hints_delta <> 0)
);

-- "Recent activity for this account" — the dominant lookup pattern.
CREATE INDEX IF NOT EXISTS balance_tx_address_created_idx
  ON balance_transactions(address, created_at DESC);

-- "Has this address ever received reason X?" — used by one-shot grants
-- (first_wallet_bonus, world_completion_bounty per-world) to detect prior
-- award without a separate "claimed" column.
CREATE INDEX IF NOT EXISTS balance_tx_address_reason_idx
  ON balance_transactions(address, reason);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sanity-check queries:
--   SELECT count(*) FROM balance_transactions;
--   SELECT reason, count(*) FROM balance_transactions GROUP BY reason;
--   SELECT * FROM balance_transactions ORDER BY created_at DESC LIMIT 20;
-- ─────────────────────────────────────────────────────────────────────────────
