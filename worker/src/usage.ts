/**
 * Per-account storage quota — a simple object-count cap.
 *
 * Each account may hold up to MAX_OBJECTS_PER_ACCOUNT blobs. With the 25 MB
 * per-blob cap (`MAX_BLOB_BYTES` in sync.ts) that bounds an account's R2 usage
 * at count × 25 MB without per-request byte accounting.
 *
 * The count is tracked in the `account_usage` D1 table (migration 0003) and
 * mutated AFTER the corresponding R2 op succeeds — see the call sites in
 * `handleBlob`. A failed counter write therefore under-counts, which is lenient
 * (it never wrongly locks out a legitimate user), so no reconciliation job is
 * needed. Only a *new* key consumes a slot; overwrites (re-uploaded
 * snapshots/journals) don't change the count.
 */

import type { Env } from './env';

/**
 * Max R2 objects per account. Generous against real study libraries (a handful
 * of journal + snapshot files); the goal is an abuse ceiling, not a tight quota.
 */
export const MAX_OBJECTS_PER_ACCOUNT = 2000;

/** Current object count for an account (0 when no row exists yet). */
export async function objectCount(env: Env, accountId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT object_count FROM account_usage WHERE account_id = ?')
    .bind(accountId)
    .first<{ object_count: number }>();
  return row?.object_count ?? 0;
}

/** Whether storing one MORE (new) object would exceed the account's cap. */
export async function isAtQuota(env: Env, accountId: string): Promise<boolean> {
  return (await objectCount(env, accountId)) >= MAX_OBJECTS_PER_ACCOUNT;
}

/**
 * Increment the account's object count by one. Call AFTER a successful PUT of a
 * previously-absent key. Best-effort at the call site: a failure under-counts.
 */
export async function incrementUsage(env: Env, accountId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO account_usage (account_id, object_count) VALUES (?, 1)
     ON CONFLICT(account_id) DO UPDATE SET object_count = object_count + 1`
  )
    .bind(accountId)
    .run();
}

/**
 * Decrement the account's object count by one (floored at 0). Call AFTER a
 * successful DELETE of a previously-present key.
 */
export async function decrementUsage(env: Env, accountId: string): Promise<void> {
  await env.DB.prepare(
    'UPDATE account_usage SET object_count = max(0, object_count - 1) WHERE account_id = ?'
  )
    .bind(accountId)
    .run();
}
