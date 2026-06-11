/**
 * Worker environment bindings, shared across route modules.
 *
 * `SIGNING_KEY` + `MODULES_BUCKET` serve the existing Lockman module
 * distribution (`/modules/*`). `SYNC_BUCKET` + `DB` back the per-account sync
 * server (`/sync/*`, `/account`, and the Phase-2 `/auth/*` routes).
 */
import type { RateLimiter } from './rate-limit';

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
  /** Cloudflare Flagship feature-flag binding (see `flags.ts`). */
  FLAGS: FlagshipBinding;
  /** Per-IP rate limiter for `POST /auth/request` (5 / 60s). */
  AUTH_REQUEST_LIMITER: RateLimiter;
  /** Per-IP rate limiter for `POST /auth/verify` (10 / 60s). */
  AUTH_VERIFY_LIMITER: RateLimiter;
}

/**
 * Minimal shape of the Cloudflare Flagship Workers binding we depend on.
 * Hand-written so the project type-checks before the Flagship app exists;
 * replace with the generated type from `npx wrangler types` once `app_id` is
 * set in `wrangler.toml`. Only `flags.ts` should reference this directly.
 * Only boolean flags are used today — add string/number methods when needed.
 */
export interface FlagshipBinding {
  getBooleanValue(key: string, defaultValue: boolean, context: object): Promise<boolean>;
}
