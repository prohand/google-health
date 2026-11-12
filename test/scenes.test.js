import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { EMPTY_MEMORY } from '../src/health/memory.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS, detectEvents } from '../src/scenes.js';

const config = normalizeConfig({ steps_goal: 10000, sleep_goal: 7 });

const snapshotOf = (overrides = {}) => ({
  syncedAt: '2026-03-04T08:00:00.000Z',
  day: '2026-03-04',
  values: { steps: 3822 },
  daily: {},
  sleep: null,
  weight: null,
  workout: null,
  errors: [],
  ...overrides,
});

const sleep = { id: 's1', minutesAsleep: 430, minutesDeep: 82, minutesRem: 95 };
const weight = { id: 'w1', time: '2026-03-02T06:30:00Z', kilograms: 72.4 };
const workout = {
  id: 'e1',
  name: 'Evening run',
  type: 'RUNNING',
  durationMinutes: 33,
  calories: 345,
  distanceKm: 5.21,
};
const known = { ...EMPTY_MEMORY, initialized: true };

test('the first read takes note and fires nothing', () => {
  const snapshot = snapshotOf({ values: { steps: 12000 }, sleep, weight, workout });
  const { events, memory } = detectEvents(EMPTY_MEMORY, snapshot, config);
  assert.deepEqual(events, []);
  assert.deepEqual(memory, {
    initialized: true,
    stepsGoalDay: '2026-03-04',
    sleepId: 's1',
    weightId: 'w1',
    weightKilograms: 72.4,
    workoutId: 'e1',
  });
});

test('the step goal fires once a day', () => {
  const below = detectEvents(known, snapshotOf(), config);
  assert.deepEqual(below.events, []);

  const reached = detectEvents(below.memory, snapshotOf({ values: { steps: 10000 } }), config);
  assert.deepEqual(reached.events, [
    { key: SCENE_TRIGGERS.STEPS_GOAL_REACHED, data: { steps: 10000, goal: 10000 } },
  ]);

  const later = detectEvents(reached.memory, snapshotOf({ values: { steps: 13000 } }), config);
  assert.deepEqual(later.events, []);

  const nextDay = snapshotOf({ day: '2026-03-05', values: { steps: 10500 } });
  assert.equal(detectEvents(later.memory, nextDay, config).events.length, 1);
});

test('a new sleep fires once, with the goal as a filter', () => {
  const first = detectEvents(known, snapshotOf({ sleep }), config);
  assert.deepEqual(first.events, [
    {
      key: SCENE_TRIGGERS.SLEEP_RECORDED,
      data: {
        quality: 'goal_reached',
        duration_minutes: 430,
        duration_hours: 7.2,
        deep_minutes: 82,
        rem_minutes: 95,
      },
    },
  ]);
  assert.deepEqual(detectEvents(first.memory, snapshotOf({ sleep }), config).events, []);

  const short = { id: 's2', minutesAsleep: 300 };
  const [event] = detectEvents(first.memory, snapshotOf({ sleep: short }), config).events;
  assert.equal(event.data.quality, 'goal_missed');
  assert.equal(event.data.deep_minutes, null);
});

test('a weigh-in says which way the weight went', () => {
  const memory = { ...known, weightId: 'w0', weightKilograms: 73 };
  const down = detectEvents(memory, snapshotOf({ weight }), config);
  assert.deepEqual(down.events, [
    {
      key: SCENE_TRIGGERS.WEIGHT_RECORDED,
      data: { trend: 'down', weight_kg: 72.4, change_kg: -0.6 },
    },
  ]);
  const same = { id: 'w2', kilograms: 72.45 };
  assert.equal(
    detectEvents(down.memory, snapshotOf({ weight: same }), config).events[0].data.trend,
    'stable',
  );
  const up = { id: 'w3', kilograms: 73.2 };
  assert.equal(
    detectEvents(down.memory, snapshotOf({ weight: up }), config).events[0].data.trend,
    'up',
  );
  // No previous weigh-in to compare with: stable, no change.
  assert.deepEqual(detectEvents(known, snapshotOf({ weight }), config).events[0].data, {
    trend: 'stable',
    weight_kg: 72.4,
    change_kg: 0,
  });
});

test('a new workout fires once', () => {
  const first = detectEvents(known, snapshotOf({ workout }), config);
  assert.deepEqual(first.events, [
    {
      key: SCENE_TRIGGERS.WORKOUT_RECORDED,
      data: {
        name: 'Evening run',
        exercise_type: 'RUNNING',
        duration_minutes: 33,
        calories: 345,
        distance_km: 5.21,
      },
    },
  ]);
  assert.deepEqual(detectEvents(first.memory, snapshotOf({ workout }), config).events, []);
});

test('event data is flat: primitives only', () => {
  const snapshot = snapshotOf({ values: { steps: 12000 }, sleep, weight, workout });
  for (const event of detectEvents(known, snapshot, config).events) {
    for (const [key, value] of Object.entries(event.data)) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value), key);
    }
  }
});

test('sync_now reads the account and returns its outputs', async () => {
  let reads = 0;
  const health = {
    config,
    snapshot: null,
    sync: async () => {
      reads += 1;
      return snapshotOf();
    },
  };
  assert.deepEqual(await SCENE_ACTIONS.sync_now(null, { fields: {}, health }), {
    steps: 3822,
    synced_at: '2026-03-04T08:00:00.000Z',
  });
  assert.equal(reads, 1);
});

test('get_daily_summary answers from the last read, in the chosen language', async () => {
  const snapshot = snapshotOf({
    values: {
      steps: 12000,
      distance: 8.44,
      total_calories: 2150,
      sleep_duration: 407,
      resting_heart_rate: 58,
      weight: 72.4,
    },
  });
  const health = {
    config,
    snapshot,
    sync: async () => assert.fail('no read needed when a snapshot exists'),
  };
  const outputs = await SCENE_ACTIONS.get_daily_summary(null, {
    fields: { language: 'fr' },
    health,
  });
  assert.equal(outputs.steps, 12000);
  assert.equal(outputs.steps_goal_reached, true);
  assert.equal(outputs.sleep_minutes, 407);
  assert.equal(outputs.heart_rate, null);
  assert.equal(
    outputs.summary,
    "Aujourd'hui : 12 000 pas (objectif 10 000), 8,4 km, 2 150 kcal. Dernier sommeil : 6 h 47. Fréquence cardiaque au repos : 58 bpm. Poids : 72,4 kg.",
  );
  const english = await SCENE_ACTIONS.get_daily_summary(null, { fields: {}, health });
  assert.match(english.summary, /^Today: 12,000 steps \(goal 10,000\)/);
  for (const value of Object.values(outputs)) {
    assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
  }
});

test('get_daily_summary reads the account when nothing was read yet', async () => {
  const health = { config, snapshot: null, sync: async () => snapshotOf({ values: {} }) };
  const outputs = await SCENE_ACTIONS.get_daily_summary(null, {
    fields: { language: 'de' },
    health,
  });
  assert.equal(outputs.steps, null);
  assert.equal(outputs.steps_goal_reached, false);
  assert.equal(outputs.summary, 'Noch keine Daten abgerufen.');
});
