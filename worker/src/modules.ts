/**
 * Lockman-licensed Bible module distribution (`/modules/*`).
 *
 * Requests must carry an HMAC-signed `Authorization` header proving they
 * originate from an official BibleMarker build (one that embeds the signing
 * key), not a public AGPL fork.
 *
 * Token format:
 *   Authorization: BibleMarker <unix_timestamp>.<base64url-hmac>
 * where `<base64url-hmac>` is HMAC-SHA256(`<module_name>:<unix_timestamp>`,
 * SIGNING_KEY). Tokens are valid for 1 hour (±1h clock skew tolerated).
 */

import type { Env } from './env';
import { jsonError } from './http';
import { clientIp, tooManyRequests } from './rate-limit';
import { hmacSha256, timingSafeEqual } from './hmac';

const TOKEN_VALIDITY_SECONDS = 3600;
const MODULE_PATH_RE = /^\/modules\/([A-Za-z0-9_.-]+\.zip)$/;
const AUTH_HEADER_RE = /^BibleMarker\s+(\d+)\.([A-Za-z0-9_-]+)$/;

export async function handleModuleRequest(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError(405, 'Method Not Allowed');
  }

  // Per-IP throttle on module egress. The HMAC build-auth below proves the
  // request came from something holding SIGNING_KEY, but that key ships in every
  // release binary and is extractable — so this rate limit, not the signature,
  // is what actually caps bulk R2 egress abuse.
  if (!(await env.MODULES_LIMITER.limit({ key: clientIp(request) })).success) {
    return tooManyRequests();
  }

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

export function computeToken(
  moduleName: string,
  timestamp: number,
  signingKey: string
): Promise<string> {
  return hmacSha256(signingKey, `${moduleName}:${timestamp}`);
}
