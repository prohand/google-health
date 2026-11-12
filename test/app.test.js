// -----------------------------------------------------------------------------
// The application end to end: a fake Gladys (from the SDK) on one side, a fake
// Google on the other. No network, no timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { OAUTH_FIELD, createApp } from '../src/app.js';
import { FEATURE_KEYS, buildDevice } from '../src/devices/index.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, createFakeGoogle, createFakeMemoryStore } from './helpers/fakeGoogle.js';

const CLIENT = { client_id: 'client', client_secret: 'secret' };
const LINKED = {
  ...CLIENT,
  refresh_token: 'refresh-1',
  access_token: 'access-1',
  token_expires_at: NOW + 30 * 60 * 1000,
  health_user_id: '111111256096816351',
};
const REDIRECT = 'https://gladys.example/oauth/callback';

/** Timers recorded instead of armed: `timers.at(-1).run()` plays a tick. */
function fakeTimers() {
  const timers = [];
  return {
    timers,
    setTimer(run, delay) {
      const timer = { run, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      timer.cleared = true;
    },
  };
}

async function setup({ config = {}, memory, created = false } = {}) {
  const google = createFakeGoogle();
  const gladys = createFakeGladys({ config });
  const clock = fakeTimers();
  const memoryStore = createFakeMemoryStore(memory);
  const app = createApp(gladys, {
    fetch: google.fetch,
    now: () => NOW,
    memoryStore,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  app.register();
  if (created) {
    // The user already added the device from the Discovery tab.
    gladys.fake.devices = [buildDevice(gladys, LINKED.health_user_id)];
  }
  await gladys.connect();
  return { app, gladys, google, memoryStore, ...clock };
}

const featureId = (gladys, key) =>
  gladys.externalIds('account', LINKED.health_user_id).feature(key);

test('without a client the integration waits and says what is missing', async () => {
  const { gladys, google, timers } = await setup();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /ID client/);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(google.calls.length, 0);
  assert.equal(timers.length, 0, 'no read timer without an account');
  assert.match((await gladys.fake.action('test_connection')).data.message.en, /client ID/);
});

test('the OAuth round trip links the account, creates the device and reads it', async () => {
  const { gladys, google, timers } = await setup({ config: CLIENT });
  assert.match(gladys.fake.connectionStatus.message.en, /Connect/);

  const authorize = await gladys.fake.oauthAuthorizeUrl(OAUTH_FIELD, REDIRECT);
  assert.equal(authorize.success, true);
  const url = new URL(authorize.data.authorize_url);
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT);
  const state = url.searchParams.get('state');
  // Until the account is linked, the test button gives the URI to declare.
  const help = await gladys.fake.action('test_connection');
  assert.ok(help.data.message.fr.endsWith(REDIRECT));

  const forged = await gladys.fake.oauthCallback(OAUTH_FIELD, {
    code: 'code',
    state: 'forged',
    redirectUri: REDIRECT,
  });
  assert.equal(forged.success, false);
  assert.equal(google.tokenRequests.length, 0);

  const callback = await gladys.fake.oauthCallback(OAUTH_FIELD, {
    code: 'code',
    state,
    redirectUri: REDIRECT,
  });
  assert.deepEqual(callback, { success: true });

  // Tokens and identity are stored in the configuration, outside the schema.
  assert.equal(gladys.fake.config.refresh_token, 'refresh-1');
  assert.equal(gladys.fake.config.access_token, 'access-1');
  assert.equal(gladys.fake.config.health_user_id, '111111256096816351');
  assert.equal(gladys.fake.connectionStatus.connected, true);

  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'Google Health');
  assert.equal(device.external_id, 'ext:test-integration:account:111111256096816351');
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').at(-1)),
    FEATURE_KEYS,
  );
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: device.external_id,
    transport: 'cloud',
  });
  assert.equal(timers.at(-1).delay, 900 * 1000, 'the next read is armed');
});

test('a second authorization without the client is refused', async () => {
  const { gladys } = await setup();
  const authorize = await gladys.fake.oauthAuthorizeUrl(OAUTH_FIELD, REDIRECT);
  assert.equal(authorize.success, false);
  assert.match(authorize.error, /client ID/);
});

test('a linked account is read on connection and its states published', async () => {
  const { gladys } = await setup({ config: LINKED, created: true });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.lastState(featureId(gladys, 'steps')), 3822);
  assert.equal(gladys.fake.lastState(featureId(gladys, 'heart_rate')), 64);
  assert.equal(gladys.fake.lastState(featureId(gladys, 'sleep_duration')), 407);
  assert.equal(gladys.fake.lastState(featureId(gladys, 'weight')), 72.4);
  assert.equal(gladys.fake.states.length, FEATURE_KEYS.length);
  assert.ok(gladys.fake.widgetRefreshes.length > 0, 'open dashboards are nudged');
});

test('states are only sent for the features the user created', async () => {
  const { gladys } = await setup({ config: LINKED });
  assert.equal(gladys.fake.states.length, 0);

  await gladys.fake.deviceCreated(buildDevice(gladys, LINKED.health_user_id));
  assert.equal(gladys.fake.states.length, FEATURE_KEYS.length);
  assert.equal(gladys.fake.lastState(featureId(gladys, 'steps')), 3822);
});

test('an unchanged value is not sent twice, a new one is', async () => {
  const { app, gladys, google } = await setup({ config: LINKED, created: true });
  const before = gladys.fake.states.length;
  await app.sync();
  assert.equal(gladys.fake.states.length, before);

  google.data.rollups.steps[0].steps.countSum = '4100';
  await app.sync();
  assert.equal(gladys.fake.states.length, before + 1);
  assert.equal(gladys.fake.lastState(featureId(gladys, 'steps')), 4100);
});

test('the timer reads again at the interval of the configuration', async () => {
  const { gladys, google, timers } = await setup({
    config: { ...LINKED, poll_frequency: 600 },
    created: true,
  });
  const timer = timers.at(-1);
  assert.equal(timer.delay, 600 * 1000);
  google.data.rollups.steps[0].steps.countSum = '5000';
  timer.run();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(gladys.fake.lastState(featureId(gladys, 'steps')), 5000);
  assert.notEqual(timers.at(-1), timer, 'and arms the next one');
});

test('an expired access token is refreshed and stored before the read', async () => {
  const { gladys, google } = await setup({
    config: { ...LINKED, access_token: 'old', token_expires_at: NOW - 1000 },
  });
  assert.equal(google.tokenRequests.length, 1);
  assert.equal(google.tokenRequests[0].grant_type, 'refresh_token');
  assert.equal(gladys.fake.config.access_token, 'access-1');
  assert.equal(gladys.fake.config.token_expires_at, NOW + 3599 * 1000);
  assert.equal(gladys.fake.config.refresh_token, 'refresh-1', 'the refresh token is kept');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a revoked access is reported, in the four languages', async () => {
  const google = createFakeGoogle();
  google.tokenFailure = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
  const gladys = createFakeGladys({ config: { ...LINKED, token_expires_at: 0 } });
  const app = createApp(gladys, {
    fetch: google.fetch,
    now: () => NOW,
    memoryStore: createFakeMemoryStore(),
    ...fakeTimers(),
  });
  app.register();
  await gladys.connect();
  const { connected, message } = gladys.fake.connectionStatus;
  assert.equal(connected, false);
  assert.deepEqual(Object.keys(message).sort(), [...LANGUAGES].sort());
  assert.match(message.fr, /reconnectez/);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  assert.match(
    (await gladys.fake.action('test_connection')).data.message.en,
    /connect your Google/,
  );
});

test('an account without a Google Health profile is explained', async () => {
  const { app, gladys, google } = await setup({ config: LINKED });
  google.apiFailure = () =>
    google.error(400, 'FAILED_PRECONDITION', 'Not linked', 'ACCOUNT_NOT_LINKED');
  await assert.rejects(app.sync());
  assert.match(gladys.fake.connectionStatus.message.en, /Fitbit/);
  google.apiFailure = null;
  await app.sync();
  assert.equal(gladys.fake.connectionStatus.connected, true, 'and recovers by itself');
});

test('scene triggers fire for what is new, and the memory is saved', async () => {
  const { app, gladys, google, memoryStore } = await setup({ config: LINKED });
  // First read: taken note of, nothing fired.
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.equal(memoryStore.memory.sleepId, 'users/1/dataTypes/sleep/dataPoints/s1');

  google.data.rollups.steps[0].steps.countSum = '10432';
  google.data.points.weight.unshift({
    name: 'w2',
    weight: { sampleTime: { physicalTime: '2026-03-04T07:00:00Z' }, weightGrams: 71900 },
  });
  await app.sync();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => [event.key, event.data]),
    [
      ['steps_goal_reached', { steps: 10432, goal: 10000 }],
      ['weight_recorded', { trend: 'down', weight_kg: 71.9, change_kg: -0.5 }],
    ],
  );
  assert.equal(memoryStore.memory.stepsGoalDay, '2026-03-04');

  await app.sync();
  assert.equal(gladys.fake.sceneEvents.length, 2, 'nothing new, nothing fired');
});

test('a restart does not fire the triggers again', async () => {
  const memory = {
    initialized: true,
    stepsGoalDay: null,
    sleepId: 'users/1/dataTypes/sleep/dataPoints/s1',
    weightId: 'users/1/dataTypes/weight/dataPoints/w1',
    weightKilograms: 72.4,
    workoutId: 'users/1/dataTypes/exercise/dataPoints/e1',
  };
  const { gladys, memoryStore } = await setup({ config: LINKED, memory });
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.equal(memoryStore.saves, 0);
});

test('the scene actions and the widgets are served through the SDK', async () => {
  const { gladys } = await setup({ config: LINKED });
  const summary = await gladys.fake.sceneAction('get_daily_summary', { language: 'es' });
  assert.equal(summary.success, true);
  const outputs = summary.data.outputs;
  assert.equal(outputs.steps, 3822);
  assert.match(outputs.summary, /^Hoy: 3822 pasos|^Hoy: 3\.822 pasos/);

  const synced = await gladys.fake.sceneAction('sync_now', {});
  assert.equal(synced.success, true);

  for (const key of ['daily_summary', 'weekly_trend']) {
    const widget = await gladys.fake.widgetGet(key, {
      settings: {},
      language: 'fr',
      units: 'metric',
    });
    assert.equal(widget.success, true, key);
    assert.deepEqual(validateWidgetContent(widget.data.content), [], key);
    const action = await gladys.fake.widgetAction(key, 'sync', {}, { settings: {} });
    assert.equal(action.success, true, key);
  }
});

test('changing a goal reads again; a token write coming back does not', async () => {
  const { gladys, google } = await setup({ config: LINKED });
  const calls = google.calls.length;

  await gladys.fake.configUpdated({ ...gladys.fake.config, access_token: 'access-1' });
  assert.equal(google.calls.length, calls, 'no read for our own token write');

  await gladys.fake.configUpdated({ ...gladys.fake.config, steps_goal: 3000 });
  assert.ok(google.calls.length > calls);
  // 3822 steps now pass the new goal.
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    ['steps_goal_reached'],
  );
});

test('changing the OAuth client unlinks the account', async () => {
  const { gladys, timers } = await setup({ config: LINKED });
  await gladys.fake.configUpdated({ ...gladys.fake.config, client_id: 'another-client' });
  assert.equal(gladys.fake.config.refresh_token, '');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Connect/);
  assert.equal(timers.at(-1).cleared, true);
});

test('disconnect revokes the access at Google and stops reading', async () => {
  const { gladys, google, timers } = await setup({ config: LINKED });
  const answer = await gladys.fake.action('disconnect');
  assert.equal(answer.success, true);
  assert.match(answer.data.message.en, /revoked at Google/);
  assert.deepEqual(google.revoked, ['refresh-1']);
  assert.equal(gladys.fake.config.refresh_token, '');
  assert.equal(gladys.fake.config.health_user_id, LINKED.health_user_id, 'the device is kept');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(timers.at(-1).cleared, true);
  assert.match((await gladys.fake.action('disconnect')).data.message.en, /No Google account/);
});

test('test_connection reads the account and reports what it found', async () => {
  const { gladys, google } = await setup({ config: LINKED });
  google.failures.weight = () => google.error(403, 'PERMISSION_DENIED', 'Missing scope');
  const answer = await gladys.fake.action('test_connection');
  assert.equal(answer.success, true);
  assert.match(answer.data.message.en, /17 metrics read\. 3,822 steps today\. 1 metric/);
  assert.match(answer.data.message.fr, /17 mesures lues/);
});

test('no token, code or secret is ever logged', async (t) => {
  const lines = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    t.mock.method(console, method, (...args) => lines.push(args.join(' ')));
  }
  const { app, gladys, google } = await setup({ config: CLIENT });
  const authorize = await gladys.fake.oauthAuthorizeUrl(OAUTH_FIELD, REDIRECT);
  const state = new URL(authorize.data.authorize_url).searchParams.get('state');
  await gladys.fake.oauthCallback(OAUTH_FIELD, { code: 'the-code', state, redirectUri: REDIRECT });
  google.apiFailure = () => google.error(500, 'INTERNAL', 'boom');
  await assert.rejects(app.sync());
  const output = lines.join('\n');
  assert.ok(lines.length > 0, 'the application logs');
  for (const secret of ['access-1', 'refresh-1', 'the-code', 'secret']) {
    assert.ok(!output.includes(secret), `"${secret}" appears in the logs`);
  }
});
