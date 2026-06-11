/**
 * BibleMarker Worker — entry point and router.
 *
 * Two responsibilities behind one Worker on `biblemarker.app`:
 *   /modules/*           Lockman-licensed module distribution (HMAC build auth)
 *   /sync/*, /account    per-account study-data sync (session-token auth)
 *   /auth/*              email-OTP sign-in (added in Phase 2)
 */

import type { Env } from './env';
import { jsonError } from './http';
import { handleModuleRequest } from './modules';
import { authenticate } from './auth';
import { handleSync } from './sync';
import { handleAccountDelete } from './account';
import { PostmarkSender } from './email';
import { handleAuthRequest, handleAuthVerify, handleAuthRevoke } from './auth-routes';
import { handleConfig, isSyncEnabled, isOtpEnabled } from './flags';
import { cleanupExpired } from './cleanup';

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/modules/')) {
      return handleModuleRequest(request, env, url);
    }

    // Sign-in routes establish a session, so they are unauthenticated
    // (/auth/revoke validates its own bearer token).
    if (path.startsWith('/auth/')) {
      if (request.method !== 'POST') return jsonError(405, 'Method Not Allowed');
      if (path === '/auth/request') {
        // OTP rollout gate: a plain on/off kill-switch for sign-in emails.
        if (!(await isOtpEnabled(env))) {
          return jsonError(503, 'Sign-in temporarily unavailable');
        }
        const sender = new PostmarkSender(env.POSTMARK_SERVER_TOKEN, env.OTP_FROM_EMAIL);
        return handleAuthRequest(request, env, sender);
      }
      if (path === '/auth/verify') return handleAuthVerify(request, env);
      if (path === '/auth/revoke') return handleAuthRevoke(request, env);
      return jsonError(404, 'Not Found');
    }

    // Feature-flag snapshot for the offline client.
    if (path === '/config') return handleConfig(request, env);

    if (path.startsWith('/sync/') || path === '/account') {
      const session = await authenticate(env, request);
      if (!session) return jsonError(401, 'Authentication required');

      if (path === '/account') {
        if (request.method !== 'DELETE') return jsonError(405, 'Method Not Allowed');
        return handleAccountDelete(env, session);
      }

      // Sync kill-switch: keyed on the verified account (account deletion above
      // is intentionally exempt so users can always leave).
      if (!(await isSyncEnabled(env, session))) {
        return jsonError(503, 'Sync temporarily disabled');
      }

      return handleSync(request, env, session, url);
    }

    return jsonError(404, 'Not Found');
  },

  // Daily cron (see `[triggers]` in wrangler.toml): sweep expired OTP codes and
  // revoked/expired sessions so the auth tables don't grow unbounded.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const result = await cleanupExpired(env.DB, new Date().toISOString());
    console.log('[cleanup]', JSON.stringify(result));
  },
};
