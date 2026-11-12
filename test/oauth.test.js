import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { OAUTH_SCOPES } from '../src/google/dataTypes.js';
import { ReauthorizationRequiredError, createOAuth } from '../src/google/oauth.js';
import { NOW, createFakeGoogle } from './helpers/fakeGoogle.js';

const config = normalizeConfig({ client_id: 'client', client_secret: 'secret' });
const REDIRECT = 'https://gladys.example/oauth/callback';

test('the consent URL asks for offline, read-only access', () => {
  const oauth = createOAuth({ fetch: createFakeGoogle().fetch, now: () => NOW });
  const url = new URL(oauth.buildAuthorizeUrl(config, REDIRECT));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client');
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  const scopes = url.searchParams.get('scope').split(' ');
  assert.deepEqual(scopes, OAUTH_SCOPES);
  for (const scope of scopes) assert.match(scope, /\.readonly$/, 'read-only scopes only');
  assert.ok(!url.toString().includes('secret'), 'the client secret never goes in a URL');
});

test('a state is accepted once, and not after it expired', () => {
  let now = NOW;
  const oauth = createOAuth({ fetch: createFakeGoogle().fetch, now: () => now });
  const state = new URL(oauth.buildAuthorizeUrl(config, REDIRECT)).searchParams.get('state');
  assert.equal(oauth.consumeState('forged'), false);
  assert.equal(oauth.consumeState(undefined), false);
  assert.equal(oauth.consumeState(state), true);
  assert.equal(oauth.consumeState(state), false, 'a state is single use');

  const late = new URL(oauth.buildAuthorizeUrl(config, REDIRECT)).searchParams.get('state');
  now += 16 * 60 * 1000;
  assert.equal(oauth.consumeState(late), false);
});

test('the code is exchanged for tokens with an expiry date', async () => {
  const google = createFakeGoogle();
  const oauth = createOAuth({ fetch: google.fetch, now: () => NOW });
  const tokens = await oauth.exchangeCode(config, 'the-code', REDIRECT);
  assert.equal(tokens.access_token, 'access-1');
  assert.equal(tokens.refresh_token, 'refresh-1');
  assert.equal(tokens.token_expires_at, NOW + 3599 * 1000);
  assert.deepEqual(google.tokenRequests[0], {
    grant_type: 'authorization_code',
    code: 'the-code',
    client_id: 'client',
    client_secret: 'secret',
    redirect_uri: REDIRECT,
  });
});

test('an exchange without a refresh token is refused', async () => {
  const google = createFakeGoogle();
  google.refreshToken = undefined;
  const oauth = createOAuth({ fetch: google.fetch, now: () => NOW });
  await assert.rejects(oauth.exchangeCode(config, 'code', REDIRECT), ReauthorizationRequiredError);
});

test('a refresh keeps the refresh token Google did not send again', async () => {
  const google = createFakeGoogle();
  google.accessToken = 'access-2';
  const oauth = createOAuth({ fetch: google.fetch, now: () => NOW });
  const linked = { ...config, refresh_token: 'refresh-1', access_token: 'old' };
  const [first, second] = await Promise.all([oauth.refresh(linked), oauth.refresh(linked)]);
  assert.equal(first.access_token, 'access-2');
  assert.equal(first.refresh_token, 'refresh-1');
  assert.equal(second, first);
  assert.equal(google.tokenRequests.length, 1, 'parallel refreshes share one request');
});

test('a token is fresh until a minute before it expires', () => {
  const oauth = createOAuth({ fetch: createFakeGoogle().fetch, now: () => NOW });
  const token = { ...config, access_token: 'a' };
  assert.equal(oauth.isFresh({ ...token, token_expires_at: NOW + 5 * 60 * 1000 }), true);
  assert.equal(oauth.isFresh({ ...token, token_expires_at: NOW + 30 * 1000 }), false);
  assert.equal(oauth.isFresh({ ...config, token_expires_at: NOW + 5 * 60 * 1000 }), false);
});

test('a revoked refresh token asks for a new authorization, a server error does not', async () => {
  const google = createFakeGoogle();
  const oauth = createOAuth({ fetch: google.fetch, now: () => NOW });
  const linked = { ...config, refresh_token: 'refresh-1' };

  google.tokenFailure = () =>
    Response.json(
      { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
      { status: 400 },
    );
  await assert.rejects(oauth.refresh(linked), ReauthorizationRequiredError);

  google.tokenFailure = () => Response.json({ error: 'internal_failure' }, { status: 500 });
  await assert.rejects(oauth.refresh(linked), (err) => {
    assert.ok(!(err instanceof ReauthorizationRequiredError));
    return true;
  });
});
