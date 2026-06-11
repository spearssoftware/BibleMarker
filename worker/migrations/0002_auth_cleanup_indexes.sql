-- Indexes supporting the scheduled cleanup DELETE scans (worker/src/cleanup.ts).
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
