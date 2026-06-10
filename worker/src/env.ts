/**
 * Worker environment bindings, shared across route modules.
 *
 * `SIGNING_KEY` + `MODULES_BUCKET` serve the existing Lockman module
 * distribution (`/modules/*`). `SYNC_BUCKET` + `DB` back the per-account sync
 * server (`/sync/*`, `/account`, and the Phase-2 `/auth/*` routes).
 */
export interface Env {
  /** Shared HMAC secret for module-download tokens. */
  SIGNING_KEY: string;
  /** R2 bucket holding `<module>.zip` files. */
  MODULES_BUCKET: R2Bucket;
  /** R2 bucket holding per-account sync blobs under `sync/{accountId}/...`. */
  SYNC_BUCKET: R2Bucket;
  /** D1 database holding accounts, devices, sessions, and OTP codes. */
  DB: D1Database;
  /** Postmark server API token for sending OTP sign-in emails. */
  POSTMARK_SERVER_TOKEN: string;
  /** Verified Postmark sender address for OTP emails (e.g. noreply@spearssoftware.com). */
  OTP_FROM_EMAIL: string;
}
