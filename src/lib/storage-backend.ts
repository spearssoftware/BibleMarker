/**
 * Storage Backend — pluggable transport for the sync engine.
 *
 * The sync engine speaks only in *logical keys* relative to a sync root
 * (e.g. `{deviceId}/0000000050.json`, `snapshots/{deviceId}_50.json`). A
 * `StorageBackend` owns all path/scoping concerns and the actual I/O, so the
 * engine's conflict-resolution / watermark / snapshot logic stays identical
 * whether the bytes land in an iCloud folder or a remote object store.
 *
 * `HttpStorageBackend` is the sole backend, speaking the same interface
 * against a sync server.
 */

import { invoke } from '@tauri-apps/api/core';

/** A single entry returned by `StorageBackend.list`. */
export interface ListEntry {
  name: string;
  isDirectory: boolean;
}

export interface StorageBackend {
  /** Write `content` at `key`, creating any parent "directories". Overwrites. */
  write(key: string, content: string): Promise<void>;
  /** Read text at `key`. Returns `null` when the key does not exist. */
  readText(key: string): Promise<string | null>;
  /**
   * List the immediate, NON-RECURSIVE children of `prefix` (`''` = root).
   * Non-recursion is load-bearing: the engine lists one device's journal files
   * without descending into `snapshots/`, so a future object-store backend must
   * emulate this with a delimiter rather than a raw prefix scan. `[]` when absent.
   */
  list(prefix: string): Promise<ListEntry[]>;
  /** Remove `key`. Idempotent — succeeds even if the key is already gone. */
  remove(key: string): Promise<void>;
}

/**
 * Sync-server-backed storage. Each method invokes a Rust `sync_*` command,
 * which attaches the session token (kept in Rust) and talks to the account-
 * scoped `/sync` routes.
 *
 * Unlike a folder backend, this does NOT collapse errors to `null`/`[]`:
 * `sync_read` returns `null` only for a genuine 404, and network/401/5xx surface
 * as a thrown structured `SyncError` so the engine can react (retry, or drop to
 * an auth-expired state) instead of mistaking a failure for "absent".
 */
export class HttpStorageBackend implements StorageBackend {
  async write(key: string, content: string): Promise<void> {
    await invoke('sync_write', { key, content });
  }

  async readText(key: string): Promise<string | null> {
    return invoke<string | null>('sync_read', { key });
  }

  async list(prefix: string): Promise<ListEntry[]> {
    return invoke<ListEntry[]>('sync_list', { prefix });
  }

  async remove(key: string): Promise<void> {
    await invoke('sync_remove', { key });
  }
}
