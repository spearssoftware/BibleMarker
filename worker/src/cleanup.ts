/**
 * Scheduled cleanup of dead auth rows. Runs from the daily cron trigger
 * (`scheduled` in index.ts) so expired OTP codes and revoked/expired sessions
 * don't accumulate unbounded. Indexed by `idx_otp_expires` / `idx_sessions_expires`
 * (migration 0002) so the DELETE scans stay cheap.
 */

export interface CleanupResult {
  otpDeleted: number;
  sessionsDeleted: number;
}

export async function cleanupExpired(db: D1Database, nowIso: string): Promise<CleanupResult> {
  const otp = await db
    .prepare('DELETE FROM otp_codes WHERE expires_at < ?1')
    .bind(nowIso)
    .run();
  const sessions = await db
    .prepare('DELETE FROM sessions WHERE revoked = 1 OR (expires_at IS NOT NULL AND expires_at < ?1)')
    .bind(nowIso)
    .run();
  return {
    otpDeleted: otp.meta?.changes ?? 0,
    sessionsDeleted: sessions.meta?.changes ?? 0,
  };
}
