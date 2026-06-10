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

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/modules/')) {
      return handleModuleRequest(request, env, url);
    }

    if (path.startsWith('/sync/') || path === '/account') {
      const session = await authenticate(env, request);
      if (!session) return jsonError(401, 'Authentication required');

      if (path === '/account') {
        if (request.method !== 'DELETE') return jsonError(405, 'Method Not Allowed');
        return handleAccountDelete(env, session);
      }

      return handleSync(request, env, session, url);
    }

    return jsonError(404, 'Not Found');
  },
};
