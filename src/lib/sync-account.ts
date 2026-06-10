/**
 * Sync-account client — the webview-side API for email-OTP sign-in.
 *
 * All HTTP and the session token live in Rust (see `src-tauri/src/sync_client.rs`).
 * These wrappers only `invoke` the Rust commands; the token never reaches the
 * webview — `verifySignInCode` returns just the `accountId`.
 */

import { invoke } from '@tauri-apps/api/core';

export type SyncErrorKind =
  | 'network'
  | 'auth'
  | 'rate_limit'
  | 'server'
  | 'client'
  | 'storage';

/** Structured error surfaced by the Rust sync commands. */
export interface SyncError {
  kind: SyncErrorKind;
  statusCode: number;
  message: string;
}

export function isSyncError(error: unknown): error is SyncError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    'statusCode' in error &&
    'message' in error
  );
}

async function getLocalDeviceId(): Promise<string> {
  const { getSqliteDb, getDeviceId } = await import('./sqlite-db');
  await getSqliteDb(); // ensures the device id is initialized
  return getDeviceId();
}

/** Request that a 6-digit sign-in code be emailed to `email`. */
export async function requestSignInCode(email: string): Promise<void> {
  await invoke('auth_request', { email });
}

export interface SignInResult {
  accountId: string;
}

/**
 * Verify an emailed code. On success the Rust side stores the session token and
 * this resolves with the account id; the token itself never enters the webview.
 */
export async function verifySignInCode(email: string, code: string): Promise<SignInResult> {
  const deviceId = await getLocalDeviceId();
  return invoke<SignInResult>('auth_verify', { email, code, deviceId });
}

/** The signed-in account id, or `null` if signed out. */
export async function getSignedInAccount(): Promise<string | null> {
  return invoke<string | null>('get_session_account');
}

/** Sign out: best-effort server revoke, then drop the local token. */
export async function signOut(): Promise<void> {
  await invoke('auth_revoke');
}

/** Drop the local token without contacting the server (e.g. after a 401). */
export async function clearLocalSession(): Promise<void> {
  await invoke('clear_session_token');
}
