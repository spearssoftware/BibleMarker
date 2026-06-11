/**
 * Shared HMAC-SHA256 primitives.
 *
 * Two callers prove a request holds a shared key: the `/modules` build-auth
 * tokens (`modules.ts`) and the `/auth/*` client-attestation header
 * (`attest.ts`). Both keys ship inside the client and are therefore extractable
 * — these primitives gate casual/scripted abuse, not a determined attacker.
 */

/** URL-safe base64 of raw bytes, no padding. */
export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** HMAC-SHA256(message) under `key`, returned as a base64url string. */
export async function hmacSha256(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

/** Constant-time equality for two equal-length strings (no early exit). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
