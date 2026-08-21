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
  /** Cloudflare Email Sending binding used to deliver OTP sign-in emails. */
  EMAIL: SendEmail;
  /** Sender address for OTP emails on the onboarded domain (e.g. noreply@biblemarker.app). */
  OTP_FROM_EMAIL: string;
  /** Cloudflare Flagship feature-flag binding (see `flags.ts`). */
  FLAGS: FlagshipBinding;
  /** Per-IP rate limiter for `POST /auth/request` (5 / 60s). */
  AUTH_REQUEST_LIMITER: RateLimiter;
  /** Per-IP rate limiter for `POST /auth/verify` (10 / 60s). */
  AUTH_VERIFY_LIMITER: RateLimiter;
  /** Per-IP rate limiter for `GET /config` (30 / 60s). */
  CONFIG_LIMITER: RateLimiter;
  /** Per-IP rate limiter for `GET/HEAD /modules/*` (60 / 60s). */
  MODULES_LIMITER: RateLimiter;
  /** Per-account rate limiter for `/sync/*` (600 / 60s), keyed on accountId. */
  SYNC_LIMITER: RateLimiter;
  /** Analytics Engine dataset for opt-in Discover-layer telemetry (see `events.ts`). Absent under `wrangler dev`. */
  EVENTS?: AnalyticsEngineDataset;
  /** Per-IP rate limiter for `POST /events` (20 / 60s). */
  EVENTS_LIMITER: RateLimiter;
}

/**
 * Minimal shape of the Cloudflare Flagship Workers binding we depend on.
 * Hand-written so the project type-checks before the Flagship app exists;
 * replace with the generated type from `npx wrangler types` once `app_id` is
 * set in `wrangler.toml`. Only `flags.ts` should reference this directly.
 * Boolean flags (kill-switches) and JSON object flags (tunable config) are
 * used today — add `getStringValue` if a string flag is ever needed.
 */
export interface FlagshipBinding {
  getBooleanValue(key: string, defaultValue: boolean, context: object): Promise<boolean>;
  getNumberValue(key: string, defaultValue: number, context: object): Promise<number>;
  getObjectValue<T extends object>(key: string, defaultValue: T, context: object): Promise<T>;
}
