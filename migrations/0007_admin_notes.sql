-- Admin notes: freeform CM notes attached to a wallet address.
-- image_data stores a base64 data URL (e.g. data:image/png;base64,...) or NULL.

CREATE TABLE IF NOT EXISTS admin_notes (
  id          SERIAL      PRIMARY KEY,
  address     TEXT        NOT NULL,
  note        TEXT        NOT NULL DEFAULT '',
  image_data  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_notes_address_idx ON admin_notes (LOWER(address));
