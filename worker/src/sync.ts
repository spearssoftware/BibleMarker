/**
 * Per-account sync routes — the storage transport for the app's sync engine.
 *
 *   PUT    /sync/blob/{key...}    write a blob (overwrite)
 *   GET    /sync/blob/{key...}    read a blob (404 → client treats as absent)
 *   DELETE /sync/blob/{key...}    delete a blob (idempotent)
 *   GET    /sync/list?prefix={p}  list immediate children of a logical prefix
 *   POST   /sync/device          register this device for the account-mgmt UI
 *
 * The client speaks *logical keys* (`{deviceId}/{seq}.json`, `snapshots/...`).
 * The real R2 key is `sync/{accountId}/{logicalKey}`, where `accountId` comes
 * from the authenticated session and is NEVER taken from the request path — that
 * is the account-isolation boundary.
 */

import type { Env } from './env';
import type { Session } from './auth';
import { jsonError, jsonOk } from './http';

/** Max blob size accepted by PUT (snapshots of large libraries are a few MB). */
export const MAX_BLOB_BYTES = 25 * 1024 * 1024;

/**
 * Safety cap on list pagination (~1M objects at R2's 1000/page). The engine
 * needs a COMPLETE listing — silently truncating would permanently skip files —
 * so exceeding the cap throws rather than returning a partial result.
 */
export const MAX_LIST_PAGES = 1000;

export interface ListEntry {
  name: string;
  isDirectory: boolean;
}

// A leaf segment: one path component, no separators or traversal.
const SAFE_SEGMENT = '[A-Za-z0-9][A-Za-z0-9_.-]*';
const KEY_RE = new RegExp(`^${SAFE_SEGMENT}(?:/${SAFE_SEGMENT})*$`);

/**
 * A logical blob key is one or more safe segments joined by `/`
 * (e.g. `device-uuid/0000000050.json`). No leading/trailing slash, no `..`,
 * no empty segments.
 */
export function isValidKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  return KEY_RE.test(key);
}

/** A list prefix is a valid key OR the empty string (the account root). */
export function isValidPrefix(prefix: string): boolean {
  return prefix === '' || isValidKey(prefix);
}

/** Real R2 key for a logical blob key within an account. */
export function scopeKey(accountId: string, key: string): string {
  return `sync/${accountId}/${key}`;
}

/**
 * Real R2 prefix for listing the immediate children of a logical prefix.
 * The trailing slash is what makes R2's `delimiter: '/'` list one level only.
 */
export function scopePrefix(accountId: string, prefix: string): string {
  const base = `sync/${accountId}/`;
  return prefix ? `${base}${prefix}/` : base;
}

/**
 * Shape an R2 delimited listing into the engine's `{name, isDirectory}[]`.
 *
 * Critically returns BARE LEAF NAMES (the prefix stripped): the engine parses
 * `parseInt(name.replace('.json',''))` and lexically sorts, so a full key would
 * be `NaN` and every journal would be skipped. Pseudo-directories have their
 * trailing `/` stripped so the engine's device-UUID regex still matches.
 */
export function shapeListing(
  serverPrefix: string,
  objectKeys: string[],
  delimitedPrefixes: string[]
): ListEntry[] {
  const entries: ListEntry[] = [];

  for (const key of objectKeys) {
    if (!key.startsWith(serverPrefix)) continue;
    const leaf = key.slice(serverPrefix.length);
    // Immediate child only — a remaining slash means it's nested deeper.
    if (leaf.length === 0 || leaf.includes('/')) continue;
    entries.push({ name: leaf, isDirectory: false });
  }

  for (const p of delimitedPrefixes) {
    if (!p.startsWith(serverPrefix)) continue;
    const leaf = p.slice(serverPrefix.length).replace(/\/$/, '');
    if (leaf.length === 0 || leaf.includes('/')) continue;
    entries.push({ name: leaf, isDirectory: true });
  }

  return entries;
}

/**
 * Fully paginate an R2 delimited list. The engine advances sync watermarks
 * per-file unconditionally, so a partial page would permanently skip files —
 * every page must be drained before returning.
 */
export async function listAll(
  bucket: R2Bucket,
  prefix: string
): Promise<{ objects: string[]; delimitedPrefixes: string[] }> {
  const objects: string[] = [];
  const delimitedPrefixes: string[] = [];
  let cursor: string | undefined;
  let pages = 0;

  for (;;) {
    const res = await bucket.list({ prefix, delimiter: '/', cursor });
    for (const o of res.objects) objects.push(o.key);
    if (res.delimitedPrefixes) delimitedPrefixes.push(...res.delimitedPrefixes);
    if (!res.truncated) break;
    cursor = res.cursor;
    if (++pages >= MAX_LIST_PAGES) {
      throw new Error(`list exceeded ${MAX_LIST_PAGES} pages for prefix ${prefix}`);
    }
  }

  return { objects, delimitedPrefixes };
}

/** Dispatch a `/sync/*` request for an authenticated session. */
export async function handleSync(
  request: Request,
  env: Env,
  session: Session,
  url: URL
): Promise<Response> {
  const path = url.pathname;

  if (path === '/sync/list') {
    if (request.method !== 'GET') return jsonError(405, 'Method Not Allowed');
    return handleList(env, session, url);
  }

  if (path === '/sync/device') {
    if (request.method !== 'POST') return jsonError(405, 'Method Not Allowed');
    return handleDevice(request, env, session);
  }

  if (path.startsWith('/sync/blob/')) {
    let key: string;
    try {
      key = decodeURIComponent(path.slice('/sync/blob/'.length));
    } catch {
      return jsonError(400, 'Invalid key'); // malformed percent-encoding
    }
    if (!isValidKey(key)) return jsonError(400, 'Invalid key');
    return handleBlob(request, env, session, key);
  }

  return jsonError(404, 'Not Found');
}

async function handleBlob(
  request: Request,
  env: Env,
  session: Session,
  key: string
): Promise<Response> {
  const scoped = scopeKey(session.accountId, key);

  if (request.method === 'GET') {
    const obj = await env.SYNC_BUCKET.get(scoped);
    if (!obj) return jsonError(404, 'Not Found');
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(obj.size),
        'Cache-Control': 'private, no-cache',
      },
    });
  }

  if (request.method === 'PUT') {
    if (!request.body) return jsonError(400, 'Body required');
    // Fast-reject on a declared oversize length, then enforce the ACTUAL byte
    // count — a chunked request omits Content-Length and would otherwise bypass
    // the header check entirely.
    const declared = request.headers.get('Content-Length');
    if (declared && Number(declared) > MAX_BLOB_BYTES) {
      return jsonError(413, 'Blob too large');
    }
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BLOB_BYTES) {
      return jsonError(413, 'Blob too large');
    }
    await env.SYNC_BUCKET.put(scoped, bytes);
    return new Response(null, { status: 204 });
  }

  if (request.method === 'DELETE') {
    await env.SYNC_BUCKET.delete(scoped); // R2 delete of a missing key is a no-op
    return new Response(null, { status: 204 });
  }

  return jsonError(405, 'Method Not Allowed');
}

async function handleList(env: Env, session: Session, url: URL): Promise<Response> {
  const prefix = url.searchParams.get('prefix') ?? '';
  if (!isValidPrefix(prefix)) return jsonError(400, 'Invalid prefix');

  const serverPrefix = scopePrefix(session.accountId, prefix);
  const { objects, delimitedPrefixes } = await listAll(env.SYNC_BUCKET, serverPrefix);
  const entries = shapeListing(serverPrefix, objects, delimitedPrefixes);
  return jsonOk({ entries });
}

async function handleDevice(request: Request, env: Env, session: Session): Promise<Response> {
  if (!session.deviceId) return jsonError(400, 'Session has no device');

  let body: { deviceName?: unknown; platform?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const name = typeof body.deviceName === 'string' ? body.deviceName.slice(0, 100) : null;
  const platform = typeof body.platform === 'string' ? body.platform.slice(0, 40) : null;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO devices (id, account_id, name, platform, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, platform = excluded.platform, updated_at = excluded.updated_at`
  )
    .bind(session.deviceId, session.accountId, name, platform, now, now)
    .run();

  return jsonOk({ ok: true });
}
