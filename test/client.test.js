import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthApiError, createHealthClient } from '../src/google/client.js';
import { createFakeGoogle } from './helpers/fakeGoogle.js';

const clientFor = (google, getAccessToken = async () => google.accessToken) =>
  createHealthClient({ getAccessToken, fetch: google.fetch });

test('the daily roll-up sends civil dates as integers, closed-open', async () => {
  const google = createFakeGoogle();
  const points = await clientFor(google).dailyRollUp('steps', '2026-02-26', '2026-03-05');
  assert.equal(points.length, 3);
  const call = google.calls.at(-1);
  assert.equal(call.method, 'POST');
  assert.equal(
    call.url,
    'https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp',
  );
  assert.deepEqual(JSON.parse(call.body), {
    range: {
      start: {
        date: { year: 2026, month: 2, day: 26 },
        time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
      },
      end: {
        date: { year: 2026, month: 3, day: 5 },
        time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
      },
    },
    windowSizeDays: 1,
  });
});

test('a list sends the filter URL-encoded and the page size', async () => {
  const google = createFakeGoogle();
  const filter = 'heart_rate.sample_time.physical_time >= "2026-03-03T08:00:00.000Z"';
  const points = await clientFor(google).listDataPoints('heart-rate', { filter, pageSize: 5 });
  assert.equal(points.length, 2);
  const url = new URL(google.calls.at(-1).url);
  assert.equal(url.pathname, '/v4/users/me/dataTypes/heart-rate/dataPoints');
  assert.equal(url.searchParams.get('filter'), filter);
  assert.equal(url.searchParams.get('pageSize'), '5');
  assert.ok(!google.calls.at(-1).url.includes('"'), 'quotes are encoded');
});

test('a 401 asks for a new token once, then retries', async () => {
  const google = createFakeGoogle();
  const asked = [];
  const client = clientFor(google, async (force) => {
    asked.push(force);
    return force ? google.accessToken : 'expired';
  });
  const identity = await client.getIdentity();
  assert.equal(identity.healthUserId, '111111256096816351');
  assert.deepEqual(asked, [false, true]);
});

test('an API error carries its status and its reason', async () => {
  const google = createFakeGoogle();
  google.apiFailure = () =>
    google.error(400, 'FAILED_PRECONDITION', 'The account is not linked.', 'ACCOUNT_NOT_LINKED');
  await assert.rejects(clientFor(google).getIdentity(), (err) => {
    assert.ok(err instanceof HealthApiError);
    assert.equal(err.status, 400);
    assert.equal(err.code, 'FAILED_PRECONDITION');
    assert.equal(err.reason, 'ACCOUNT_NOT_LINKED');
    return true;
  });
});

test('a network failure is reported without the token', async () => {
  const client = createHealthClient({
    getAccessToken: async () => 'secret-token',
    fetch: async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    },
  });
  await assert.rejects(client.getIdentity(), (err) => {
    assert.match(err.message, /unreachable/);
    assert.ok(!err.message.includes('secret-token'));
    return true;
  });
});
