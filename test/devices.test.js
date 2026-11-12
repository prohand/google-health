import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  FEATURES,
  buildDevice,
  buildDiscoveredDevices,
  buildStates,
  buildTransports,
} from '../src/devices/index.js';

const USER = '111111256096816351';

// Published keys are forever: Gladys keys the history, the scenes and the
// dashboards on them. Extend this list, never edit a line of it.
const PUBLISHED_KEYS = [
  'steps',
  'distance',
  'active_calories',
  'total_calories',
  'floors',
  'active_zone_minutes',
  'heart_rate',
  'resting_heart_rate',
  'sleep_duration',
  'sleep_deep',
  'sleep_rem',
  'sleep_light',
  'sleep_awake',
  'weight',
  'body_fat',
  'oxygen_saturation',
  'heart_rate_variability',
  'respiratory_rate',
];

test('the feature keys already published never change', () => {
  const keys = FEATURES.map((feature) => feature.key);
  assert.deepEqual(keys.slice(0, PUBLISHED_KEYS.length), PUBLISHED_KEYS);
  assert.equal(new Set(keys).size, keys.length);
});

test('Gladys accepts the device: known categories, types and units', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  // The fake Gladys refuses what the host API refuses, with the same 400.
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, USER));
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.external_id, `ext:test-integration:account:${USER}`);
  assert.equal(device.poll_frequency, undefined, 'the integration reads on its own timer');
  for (const feature of device.features) {
    assert.equal(feature.read_only, true);
    assert.equal(feature.keep_history, true);
    assert.equal(feature.min, 0);
    assert.ok(feature.max > 0, feature.name);
  }
});

test('no account, no device', () => {
  const gladys = createFakeGladys();
  assert.deepEqual(buildDiscoveredDevices(gladys, ''), []);
  assert.deepEqual(buildTransports(gladys, '', true), []);
});

test('states are built for created features holding a value', () => {
  const gladys = createFakeGladys();
  const device = buildDevice(gladys, USER);
  const values = { steps: 3822, weight: 72.4, heart_rate: undefined };
  assert.deepEqual(buildStates(gladys, USER, values), [], 'device not created yet');

  // The user only kept two features of the device.
  gladys.devices = [{ ...device, features: device.features.slice(0, 2) }];
  assert.deepEqual(buildStates(gladys, USER, values), [
    { device_feature_external_id: `${device.external_id}:steps`, state: 3822 },
  ]);
});

test('the transport badge is cloud, or unreachable', () => {
  const gladys = createFakeGladys();
  const [up] = buildTransports(gladys, USER, true);
  const [down] = buildTransports(gladys, USER, false);
  assert.equal(up.transport, 'cloud');
  assert.equal(down.transport, 'unreachable');
});
