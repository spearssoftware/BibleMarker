/**
 * Account lifecycle.
 *
 *   DELETE /account   permanently delete the account, its devices/sessions, and
 *                     all synced blobs. Required for App Store / Play compliance.
 */

import type { Env } from './env';
import type { Session } from './auth';
import { emailHash } from './auth';
import { jsonOk } from './http';

/** Safety bound on the delete-all loop (mirrors sync's MAX_LIST_PAGES). */
const MAX_DELETE_PASSES = 1000;

/**
 * Delete every R2 object under `sync/{accountId}/`.
 *
 * Re-lists from the start each pass rather than threading a cursor: we delete
 * the objects we just listed, so the set shrinks under us and an offset/cursor
 * would skip keys. Each pass deletes a full page; the loop ends when a list
 * comes back empty.
 */
export async function deleteAllAccountBlobs(bucket: R2Bucket, accountId: string): Promise<void> {
  const prefix = `sync/${accountId}/`;

  for (let pass = 0; pass < MAX_DELETE_PASSES; pass++) {
    const res = await bucket.list({ prefix });
    const keys = res.objects.map((o) => o.key);
    if (keys.length === 0) return;
    await bucket.delete(keys);
  }
  throw new Error(`account ${accountId} blob deletion exceeded ${MAX_DELETE_PASSES} passes`);
}

export async function handleAccountDelete(env: Env, session: Session): Promise<Response> {
  const { accountId } = session;

  // Blobs first. R2 is not transactional with D1; doing it first means a later
  // D1 failure leaves the account re-deletable rather than orphaning blobs.
  await deleteAllAccountBlobs(env.SYNC_BUCKET, accountId);

  const account = await env.DB.prepare('SELECT email FROM accounts WHERE id = ?')
    .bind(accountId)
    .first<{ email: string }>();

  const statements = [
    env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(accountId),
    env.DB.prepare('DELETE FROM devices WHERE account_id = ?').bind(accountId),
    env.DB.prepare('DELETE FROM account_usage WHERE account_id = ?').bind(accountId),
    env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId),
  ];
  if (account?.email) {
    statements.push(
      env.DB.prepare('DELETE FROM otp_codes WHERE email_hash = ?').bind(
        await emailHash(account.email)
      )
    );
  }
  await env.DB.batch(statements);

  return jsonOk({ ok: true });
}
