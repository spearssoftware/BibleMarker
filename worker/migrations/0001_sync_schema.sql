-- BibleMarker sync server — D1 schema.
--
-- Apply locally:   wrangler d1 migrations apply biblemarker-sync --local
-- Apply remotely:  wrangler d1 migrations apply biblemarker-sync --remote
--
-- One email == one synced library (per-person sync). Sync blobs live in R2 under
-- sync/{account_id}/...; this DB holds only account/device/session/auth metadata.

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,        -- UUID
  email      TEXT NOT NULL UNIQUE,    -- lowercased
  created_at TEXT NOT NULL            -- ISO-8601
);

CREATE TABLE IF NOT EXISTS devices (
  id         TEXT PRIMARY KEY,        -- device UUID (matches the app's local device id)
  account_id TEXT NOT NULL,
  name       TEXT,
  platform   TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,      -- SHA-256 hex of the opaque session token
  account_id   TEXT NOT NULL,
  device_id    TEXT,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  expires_at   TEXT,                  -- NULL = no expiry; enforced once Phase 2 issues tokens
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);

-- Email-OTP sign-in codes (issued/consumed in Phase 2). Defined now so the
-- schema is stable. email_hash avoids storing raw emails for unverified attempts.
CREATE TABLE IF NOT EXISTS otp_codes (
  email_hash TEXT NOT NULL,           -- SHA-256 hex of the lowercased email
  code_hash  TEXT NOT NULL,           -- SHA-256 hex of the 6-digit code
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email_hash);
