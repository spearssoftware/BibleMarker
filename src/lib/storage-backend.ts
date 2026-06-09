/**
 * Storage Backend — pluggable transport for the sync engine.
 *
 * The sync engine speaks only in *logical keys* relative to a sync root
 * (e.g. `{deviceId}/0000000050.json`, `snapshots/{deviceId}_50.json`). A
 * `StorageBackend` owns all path/scoping concerns and the actual I/O, so the
 * engine's conflict-resolution / watermark / snapshot logic stays identical
 * whether the bytes land in an iCloud folder or a remote object store.
 *
 * `FolderStorageBackend` is the filesystem implementation (iCloud Drive,
 * OneDrive, Dropbox, …). A future `HttpStorageBackend` will speak the same
 * interface against a sync server.
 */

import { readDir, readTextFile, remove } from '@tauri-apps/plugin-fs';
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
 * Filesystem-backed storage rooted at a cloud-synced folder.
 *
 * Writes go through the `write_sync_file` Rust command (which uses
 * `std::fs::write` + `create_dir_all` — required for the iCloud ubiquity
 * container, where the JS fs plugin lacks permission). Reads/listing/removal
 * use the fs plugin directly.
 */
export class FolderStorageBackend implements StorageBackend {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    return key ? `${this.root}/${key}` : this.root;
  }

  async write(key: string, content: string): Promise<void> {
    await invoke('write_sync_file', { path: this.resolve(key), content });
  }

  async readText(key: string): Promise<string | null> {
    try {
      return await readTextFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async list(prefix: string): Promise<ListEntry[]> {
    try {
      const entries = await readDir(this.resolve(prefix));
      return entries.map((e) => ({ name: e.name ?? '', isDirectory: e.isDirectory }));
    } catch {
      return [];
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await remove(this.resolve(key));
    } catch {
      /* idempotent — already gone is success */
    }
  }
}
