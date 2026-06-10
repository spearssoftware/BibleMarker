/**
 * Lightweight in-memory test doubles for R2 / D1 / Flagship. Not bundled — only
 * reachable from *.test.ts, never from index.ts.
 */

import type { Env } from './env';

async function toText(value: unknown): Promise<string> {
  if (typeof value === 'string') return value;
  if (value instanceof ReadableStream) return new Response(value).text();
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value as Uint8Array);
  return String(value);
}

/**
 * In-memory R2 stand-in implementing the subset the sync routes use
 * (put/get/delete/list). `list` emulates `delimiter: '/'` grouping faithfully:
 * it paginates over the COMBINED, ordered set of objects and common prefixes,
 * so a pseudo-directory whose first child sorts past a page boundary is emitted
 * on a LATER page — exactly as real R2 does. This is what lets a test prove that
 * `listAll` accumulates delimited prefixes across pages, not just on page 0.
 */
export class MemoryR2 {
  readonly store = new Map<string, string>();

  constructor(private readonly pageSize = 1000) {}

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, await toText(value));
  }

  async get(key: string): Promise<{ body: string; size: number } | null> {
    if (!this.store.has(key)) return null;
    const content = this.store.get(key) as string;
    return { body: content, size: new TextEncoder().encode(content).length };
  }

  async delete(keys: string | string[]): Promise<void> {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) this.store.delete(k);
  }

  async list(opts?: { prefix?: string; delimiter?: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    delimitedPrefixes: string[];
    truncated: boolean;
    cursor?: string;
  }> {
    const prefix = opts?.prefix ?? '';
    const delimiter = opts?.delimiter;
    const all = [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();

    // Ordered combined listing: each key is either a direct object or rolls up
    // into a common prefix emitted at the position of its first member.
    const combined: Array<{ type: 'object' | 'prefix'; value: string }> = [];
    const seenPrefix = new Set<string>();
    for (const k of all) {
      const rest = k.slice(prefix.length);
      if (delimiter && rest.includes(delimiter)) {
        const dir = prefix + rest.slice(0, rest.indexOf(delimiter) + 1);
        if (!seenPrefix.has(dir)) {
          seenPrefix.add(dir);
          combined.push({ type: 'prefix', value: dir });
        }
      } else {
        combined.push({ type: 'object', value: k });
      }
    }

    const start = opts?.cursor ? parseInt(opts.cursor, 10) : 0;
    const end = start + this.pageSize;
    const page = combined.slice(start, end);
    const truncated = end < combined.length;
    return {
      objects: page.filter((e) => e.type === 'object').map((e) => ({ key: e.value })),
      delimitedPrefixes: page.filter((e) => e.type === 'prefix').map((e) => e.value),
      truncated,
      cursor: truncated ? String(end) : undefined,
    };
  }
}

/** Cast a MemoryR2 to the R2Bucket type the handlers expect. */
export function asBucket(mock: MemoryR2): R2Bucket {
  return mock as unknown as R2Bucket;
}

interface OtpRecord {
  email_hash: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
}
interface AccountRecord {
  id: string;
  email: string;
  created_at: string;
}
interface SessionRecord {
  token_hash: string;
  account_id: string;
  device_id: string | null;
  expires_at: string | null;
  revoked: number;
}

/**
 * Focused in-memory D1 for the auth-route tests. Recognizes exactly the
 * statements the auth handlers issue (matched by SQL prefix/substring) and
 * mutates in-memory tables. Test-only — never reachable from index.ts.
 */
export class MemoryD1 {
  readonly otp = new Map<string, OtpRecord>(); // one active code per email_hash
  readonly accounts: AccountRecord[] = [];
  readonly sessions = new Map<string, SessionRecord>();

  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        first: async () => this.first(sql, args),
        run: async () => this.run(sql, args),
      }),
    };
  }

  private first(sql: string, args: unknown[]): unknown {
    if (sql.includes('SELECT created_at FROM otp_codes')) {
      const r = this.otp.get(args[0] as string);
      return r ? { created_at: r.created_at } : null;
    }
    if (sql.includes('SELECT code_hash, expires_at, attempts FROM otp_codes')) {
      const r = this.otp.get(args[0] as string);
      return r ? { code_hash: r.code_hash, expires_at: r.expires_at, attempts: r.attempts } : null;
    }
    if (sql.includes('SELECT id FROM accounts WHERE email')) {
      const a = this.accounts.find((x) => x.email === args[0]);
      return a ? { id: a.id } : null;
    }
    if (sql.includes('SELECT account_id, device_id FROM sessions')) {
      const s = this.sessions.get(args[0] as string);
      const nowIso = args[1] as string;
      if (!s || s.revoked !== 0) return null;
      if (s.expires_at !== null && s.expires_at <= nowIso) return null;
      return { account_id: s.account_id, device_id: s.device_id };
    }
    return null;
  }

  private run(sql: string, args: unknown[]): { success: true } {
    if (sql.startsWith('DELETE FROM otp_codes')) {
      this.otp.delete(args[0] as string);
    } else if (sql.startsWith('INSERT INTO otp_codes')) {
      this.otp.set(args[0] as string, {
        email_hash: args[0] as string,
        code_hash: args[1] as string,
        expires_at: args[2] as string,
        attempts: 0,
        created_at: args[3] as string,
      });
    } else if (sql.startsWith('UPDATE otp_codes SET attempts')) {
      const r = this.otp.get(args[0] as string);
      if (r) r.attempts += 1;
    } else if (sql.startsWith('INSERT INTO accounts')) {
      if (this.accounts.some((a) => a.email === args[1])) {
        throw new Error('UNIQUE constraint failed: accounts.email');
      }
      this.accounts.push({ id: args[0] as string, email: args[1] as string, created_at: args[2] as string });
    } else if (sql.startsWith('INSERT INTO sessions')) {
      this.sessions.set(args[0] as string, {
        token_hash: args[0] as string,
        account_id: args[1] as string,
        device_id: (args[2] as string | null) ?? null,
        expires_at: (args[5] as string | null) ?? null,
        revoked: 0,
      });
    } else if (sql.startsWith('UPDATE sessions SET revoked')) {
      const s = this.sessions.get(args[0] as string);
      if (s) s.revoked = 1;
    } else if (sql.startsWith('UPDATE sessions SET last_used_at')) {
      /* advisory no-op */
    }
    return { success: true };
  }
}

/** Cast a MemoryD1 to the D1Database type the handlers expect. */
export function asDb(mock: MemoryD1): D1Database {
  return mock as unknown as D1Database;
}

/**
 * In-memory Flagship binding. Returns preset values for known keys and the
 * supplied default for everything else, and records the last evaluation context
 * so tests can assert what was sent (targetingKey, accountId, headers).
 */
export class MemoryFlags {
  /** Every evaluation context seen, in order. */
  readonly contexts: unknown[] = [];

  constructor(private readonly values: Record<string, boolean | number | string> = {}) {}

  /** Context of the most recent evaluation. */
  get lastContext(): unknown {
    return this.contexts.at(-1) ?? null;
  }

  async getBooleanValue(key: string, def: boolean, ctx: object): Promise<boolean> {
    this.contexts.push(ctx);
    return key in this.values ? (this.values[key] as boolean) : def;
  }

  async getNumberValue(key: string, def: number, ctx: object): Promise<number> {
    this.contexts.push(ctx);
    return key in this.values ? (this.values[key] as number) : def;
  }

  async getStringValue(key: string, def: string, ctx: object): Promise<string> {
    this.contexts.push(ctx);
    return key in this.values ? (this.values[key] as string) : def;
  }
}

/** Cast a MemoryFlags to the Flagship binding type the handlers expect. */
export function asFlags(mock: MemoryFlags): Env['FLAGS'] {
  return mock as unknown as Env['FLAGS'];
}
