/**
 * BibleMarker module distribution Worker.
 *
 * Serves Lockman-licensed Bible modules (NASB, others) from an R2 bucket to
 * the official BibleMarker app. Requests must carry a valid HMAC-signed
 * `Authorization` header proving they originate from a build that has the
 * embedded signing key — i.e. an official BibleMarker build, not a public
 * AGPL fork.
 *
 * Token format:
 *   Authorization: BibleMarker <unix_timestamp>.<base64url-hmac>
 *
 * Where `<base64url-hmac>` is HMAC-SHA256(`<module_name>:<unix_timestamp>`,
 * SIGNING_KEY).
 *
 * Tokens are valid for 1 hour from the timestamp they encode (clock skew on
 * either side ±1h is tolerated).
 */

export interface Env {
  /** Shared HMAC secret. Set via: wrangler secret put SIGNING_KEY */
  SIGNING_KEY: string;
  /** R2 bucket holding `<module>.zip` files */
  MODULES_BUCKET: R2Bucket;
}

const TOKEN_VALIDITY_SECONDS = 3600;
const MODULE_PATH_RE = /^\/modules\/([A-Za-z0-9_.-]+\.zip)$/;
const AUTH_HEADER_RE = /^BibleMarker\s+(\d+)\.([A-Za-z0-9_-]+)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonError(405, 'Method Not Allowed');
    }

    const url = new URL(request.url);
    const match = MODULE_PATH_RE.exec(url.pathname);
    if (!match) {
      return jsonError(404, 'Not Found');
    }
    const moduleName = match[1];

    const auth = request.headers.get('Authorization');
    if (!auth) {
      return jsonError(401, 'Authorization header required');
    }

    const verified = await verifyToken(auth, moduleName, env.SIGNING_KEY);
    if (!verified) {
      return jsonError(401, 'Invalid or expired token');
    }

    const obj = await env.MODULES_BUCKET.get(moduleName);
    if (!obj) {
      return jsonError(404, `Module ${moduleName} not found`);
    }

    // Structured log for Lockman annual reporting.
    const cf = (request as { cf?: IncomingRequestCfProperties }).cf;
    console.log(
      JSON.stringify({
        event: 'module_download',
        module: moduleName,
        timestamp: new Date().toISOString(),
        country: cf?.country,
      })
    );

    if (request.method === 'HEAD') {
      return new Response(null, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': String(obj.size),
        },
      });
    }

    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(obj.size),
        'Cache-Control': 'private, no-cache',
      },
    });
  },
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function verifyToken(
  authHeader: string,
  moduleName: string,
  signingKey: string
): Promise<boolean> {
  const m = AUTH_HEADER_RE.exec(authHeader);
  if (!m) return false;

  const timestamp = parseInt(m[1], 10);
  const providedToken = m[2];

  if (!Number.isFinite(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TOKEN_VALIDITY_SECONDS) return false;

  const expected = await computeToken(moduleName, timestamp, signingKey);
  return timingSafeEqual(expected, providedToken);
}

export async function computeToken(
  moduleName: string,
  timestamp: number,
  signingKey: string
): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const message = `${moduleName}:${timestamp}`;
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
