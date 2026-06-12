/**
 * Per-IP rate limiting for the unauthenticated `/auth/*` routes.
 *
 * Backed by the Cloudflare Workers Rate Limiting binding (`[[ratelimits]]` in
 * wrangler.toml). The binding's runtime shape is `limit({ key }) → { success }`,
 * so the `RateLimiter` interface below matches it exactly and the real binding
 * satisfies it with no wrapper — `MemoryRateLimiter` (test-mocks) stands in for
 * unit tests, where the live binding isn't available.
 *
 * Note: the binding is per-colo and best-effort (not a globally exact counter),
 * which is the right tradeoff for abuse mitigation. The durable bound on OTP
 * brute force is the per-email resend cooldown in `auth-routes.ts`.
 */

export interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

/**
 * 429 with a `Retry-After` header, shared by every rate-limited route. (The plain
 * `jsonError` helper can't carry the extra header.) Kept here so `/auth/*`,
 * `/config`, `/modules`, and `/sync/*` all answer a throttle identically.
 */
export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  });
}

/**
 * The client IP to rate-limit on. `CF-Connecting-IP` is set by Cloudflare at the
 * edge on the deployed routes and can't be spoofed by the caller. When it's
 * absent (local dev, misconfiguration) we fall back to a single shared bucket so
 * the request is still counted rather than slipping past the limit.
 */
export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}
