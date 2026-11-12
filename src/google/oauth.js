// -----------------------------------------------------------------------------
// Google OAuth 2.0 (authorization code flow, "Web application" client).
//
// Gladys relays the browser round trip (the `oauth2` field of the manifest):
// the integration builds the consent URL, receives the `code`, exchanges it
// and keeps the tokens. The access token lives an hour, the refresh token
// renews it without the user.
//
// Nothing here logs a token, a code or the client secret.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { OAUTH_SCOPES } from './dataTypes.js';

export const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// A consent screen left open longer than this is refused on return.
const STATE_TTL_MS = 15 * 60 * 1000;
// Renew a token this long before Google stops accepting it.
const EXPIRY_MARGIN_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 20 * 1000;

/** Google refused the tokens for good: the user has to link the account again. */
export class ReauthorizationRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReauthorizationRequiredError';
  }
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] HTTP client (tests pass their own)
 * @param {() => number} [options.now] clock, in milliseconds
 */
export function createOAuth({ fetch: fetchImpl = fetch, now = Date.now } = {}) {
  // Anti-CSRF states of the consent screens currently open: state -> expiry.
  const pendingStates = new Map();
  // One refresh at a time: Google may rotate the token, two parallel refreshes
  // would race for it.
  let refreshing = null;

  function forgetExpiredStates() {
    for (const [state, expiresAt] of pendingStates) {
      if (expiresAt <= now()) pendingStates.delete(state);
    }
  }

  async function tokenRequest(params) {
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`Google token endpoint unreachable: ${err.message}`, { cause: err });
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = body.error_description || body.error || `HTTP ${response.status}`;
      // `invalid_grant`: the refresh token was revoked or expired (7 days for
      // an OAuth consent screen left in "Testing"); `invalid_client`: the
      // client id or secret is wrong. Retrying cannot fix either.
      if (['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(body.error)) {
        throw new ReauthorizationRequiredError(`Google refused the credentials: ${reason}`);
      }
      throw new Error(`Google token request failed: ${reason}`);
    }
    return body;
  }

  function toStoredTokens(body, previousRefreshToken = '') {
    return {
      access_token: body.access_token,
      // Google only sends a refresh token on the first consent (or with
      // prompt=consent): keep the one we have otherwise.
      refresh_token: body.refresh_token || previousRefreshToken,
      token_expires_at: now() + Number(body.expires_in ?? 3600) * 1000,
      granted_scopes: typeof body.scope === 'string' ? body.scope : '',
    };
  }

  return {
    /**
     * The Google consent URL. `access_type=offline` + `prompt=consent` make
     * Google issue a refresh token every time the account is linked.
     */
    buildAuthorizeUrl(config, redirectUri) {
      forgetExpiredStates();
      const state = randomUUID();
      pendingStates.set(state, now() + STATE_TTL_MS);
      const query = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: OAUTH_SCOPES.join(' '),
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        state,
      });
      return `${AUTHORIZE_URL}?${query}`;
    },

    /** Whether `state` is one this integration issued; a state is used once. */
    consumeState(state) {
      forgetExpiredStates();
      return typeof state === 'string' && pendingStates.delete(state);
    },

    /** Exchange the authorization code for the tokens to store. */
    async exchangeCode(config, code, redirectUri) {
      const body = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        client_id: config.client_id,
        client_secret: config.client_secret,
        redirect_uri: redirectUri,
      });
      const tokens = toStoredTokens(body);
      if (!tokens.refresh_token) {
        throw new ReauthorizationRequiredError(
          'Google sent no refresh token: remove the access in your Google account, then connect again.',
        );
      }
      return tokens;
    },

    /** Whether the stored access token is still good for a request. */
    isFresh(config) {
      return config.access_token !== '' && config.token_expires_at - EXPIRY_MARGIN_MS > now();
    },

    /** Renew the access token; resolves the tokens to store. */
    refresh(config) {
      if (!refreshing) {
        refreshing = tokenRequest({
          grant_type: 'refresh_token',
          refresh_token: config.refresh_token,
          client_id: config.client_id,
          client_secret: config.client_secret,
        })
          .then((body) => toStoredTokens(body, config.refresh_token))
          .finally(() => {
            refreshing = null;
          });
      }
      return refreshing;
    },
  };
}
