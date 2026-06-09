/**
 * Lightweight in-memory test doubles for R2 / D1. Not bundled — only reachable
 * from *.test.ts, never from index.ts.
 */

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
