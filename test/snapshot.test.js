import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHealthClient } from '../src/google/client.js';
import { fetchSnapshot } from '../src/health/snapshot.js';
import { addDays, civilDay, formatDuration, fromCivilDate } from '../src/health/time.js';
import { NOW, createFakeGoogle, rollup } from './helpers/fakeGoogle.js';

const read = (google, options = {}) =>
  fetchSnapshot(
    createHealthClient({ getAccessToken: async () => google.accessToken, fetch: google.fetch }),
    { timeZone: 'Europe/Paris', now: NOW, ...options },
  );

test('a snapshot holds every metric in the unit Gladys shows', async () => {
  const snapshot = await read(createFakeGoogle());
  assert.equal(snapshot.day, '2026-03-04');
  assert.equal(snapshot.syncedAt, '2026-03-04T08:00:00.000Z');
  assert.deepEqual(snapshot.errors, []);
  assert.deepEqual(snapshot.values, {
    steps: 3822,
    distance: 2.95, // 2 954 000 mm
    active_calories: 413,
    total_calories: 1890,
    floors: 7,
    active_zone_minutes: 20,
    heart_rate: 64, // the most recent sample
    resting_heart_rate: 58,
    weight: 72.4, // 72 400 g
    body_fat: 19.4,
    oxygen_saturation: 96.2,
    heart_rate_variability: 41.3,
    respiratory_rate: 14.8,
    sleep_duration: 407,
    sleep_deep: 82,
    sleep_rem: 95,
    sleep_light: 230,
    sleep_awake: 57,
  });
});

test('the history covers seven days, a day without data counting zero', async () => {
  const { daily } = await read(createFakeGoogle());
  assert.deepEqual(
    daily.steps.map(({ date, value }) => [date, value]),
    [
      ['2026-02-26', 0],
      ['2026-02-27', 0],
      ['2026-02-28', 0],
      ['2026-03-01', 8000],
      ['2026-03-02', 0],
      ['2026-03-03', 11250],
      ['2026-03-04', 3822],
    ],
  );
});

test('the day is the one of the user, not of the container', async () => {
  const google = createFakeGoogle();
  // 23:30 UTC on March 4th is already March 5th in Paris.
  google.data.rollups.steps.push(rollup('2026-03-05', 'steps', { countSum: '12' }));
  const now = Date.parse('2026-03-04T23:30:00Z');
  assert.equal((await read(google, { now })).values.steps, 12);
  assert.equal((await read(google, { now, timeZone: 'UTC' })).values.steps, 3822);
  const body = JSON.parse(
    google.calls.find((call) => call.url.endsWith('steps/dataPoints:dailyRollUp')).body,
  );
  assert.deepEqual(body.range.end.date, { year: 2026, month: 3, day: 6 });
});

test('sleep, weigh-in and workout keep what the scene triggers need', async () => {
  const { sleep, weight, workout } = await read(createFakeGoogle());
  assert.equal(sleep.id, 'users/1/dataTypes/sleep/dataPoints/s1');
  assert.equal(sleep.minutesAsleep, 407);
  assert.deepEqual(weight, {
    id: 'users/1/dataTypes/weight/dataPoints/w1',
    time: '2026-03-02T06:30:00Z',
    kilograms: 72.4,
  });
  assert.deepEqual(workout, {
    id: 'users/1/dataTypes/exercise/dataPoints/e1',
    name: 'Evening run',
    type: 'RUNNING',
    endTime: '2026-03-03T17:35:00Z',
    durationMinutes: 33,
    calories: 345,
    distanceKm: 5.21,
  });
});

test('the main sleep wins over a later nap', async () => {
  const google = createFakeGoogle();
  google.data.points.sleep.unshift({
    name: 'nap',
    sleep: {
      interval: { startTime: '2026-03-04T06:30:00Z', endTime: '2026-03-04T07:00:00Z' },
      metadata: { main: false },
      summary: { minutesAsleep: '25' },
    },
  });
  assert.equal((await read(google)).values.sleep_duration, 407);
});

test('a metric Google refuses is left out, the others are read', async () => {
  const google = createFakeGoogle();
  google.failures.weight = () => google.error(403, 'PERMISSION_DENIED', 'Missing scope');
  google.failures.sleep = () => google.error(403, 'PERMISSION_DENIED', 'Missing scope');
  const snapshot = await read(google);
  assert.equal(snapshot.values.weight, undefined);
  assert.equal(snapshot.values.sleep_duration, undefined);
  assert.equal(snapshot.sleep, null);
  assert.equal(snapshot.values.steps, 3822);
  assert.deepEqual(snapshot.errors.map((error) => [error.metric, error.status]).sort(), [
    ['sleep', 403],
    ['weight', 403],
  ]);
});

test('an account with no data gives zero activity and nothing else', async () => {
  const snapshot = await read(createFakeGoogle({ data: { rollups: {}, points: {} } }));
  assert.deepEqual(snapshot.values, {
    steps: 0,
    distance: 0,
    active_calories: 0,
    total_calories: 0,
    floors: 0,
    active_zone_minutes: 0,
  });
  assert.equal(snapshot.sleep, null);
  assert.equal(snapshot.weight, null);
  assert.equal(snapshot.workout, null);
});

test('when nothing answers, the read fails with the error of Google', async () => {
  const google = createFakeGoogle();
  google.apiFailure = () =>
    google.error(400, 'FAILED_PRECONDITION', 'Not linked', 'ACCOUNT_NOT_LINKED');
  await assert.rejects(read(google), (err) => err.reason === 'ACCOUNT_NOT_LINKED');
});

test('the requests stay within the ranges and filters the API accepts', async () => {
  const google = createFakeGoogle();
  await read(google);
  const filters = google.calls
    .map((call) => new URL(call.url).searchParams.get('filter'))
    .filter(Boolean);
  assert.ok(filters.includes('daily_resting_heart_rate.date >= "2026-02-25"'));
  assert.ok(filters.includes('sleep.interval.end_time >= "2026-03-02T20:00:00.000Z"'));
  assert.ok(filters.includes('heart_rate.sample_time.physical_time >= "2026-03-03T08:00:00.000Z"'));
  for (const filter of filters) {
    assert.ok(!/ OR |<=|[^<>]=[^=]/.test(filter.replace('>=', '')), `filter "${filter}"`);
  }
});

test('civil date helpers', () => {
  assert.equal(civilDay(new Date('2026-03-04T23:30:00Z'), 'Europe/Paris'), '2026-03-05');
  assert.equal(civilDay(new Date('2026-03-04T23:30:00Z'), 'America/New_York'), '2026-03-04');
  assert.match(civilDay(new Date('2026-03-04T12:00:00Z'), 'Not/AZone'), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(fromCivilDate({ year: 2026, month: 3, day: 4 }), '2026-03-04');
  assert.equal(fromCivilDate({}), undefined);
  assert.equal(formatDuration(407), '6 h 47');
  assert.equal(formatDuration(65), '1 h 05');
});
