// -----------------------------------------------------------------------------
// The Gladys device of a Google Health account.
//
// One linked account = one device, whose features are the health metrics. Its
// external id is built from the `healthUserId` Google gives the account: it is
// stable, so the history follows the user even if the account is linked again.
//
// The feature keys below are forever (Gladys keys the history, the scenes and
// the dashboards on them): add features, never rename one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';

const DEVICE_TYPE = 'account';

const { COUNTER_SENSOR, DISTANCE_SENSOR, DURATION, UNKNOWN } = DEVICE_FEATURE_CATEGORIES;
const { INTEGER, DECIMAL } = DEVICE_FEATURE_TYPES.SENSOR;

// Gladys has no health category yet: counts go to `counter-sensor`, times to
// `duration`, distances to `distance-sensor`. Units Gladys does not know (bpm,
// kcal, kg) are written in the feature name. `key` is also the key of the
// value in a snapshot (src/health/snapshot.js).
export const FEATURES = [
  { key: 'steps', name: 'Steps today', category: COUNTER_SENSOR, type: INTEGER, max: 200000 },
  {
    key: 'distance',
    name: 'Distance today',
    category: DISTANCE_SENSOR,
    type: DECIMAL,
    unit: DEVICE_FEATURE_UNITS.KM,
    max: 500,
  },
  {
    key: 'active_calories',
    name: 'Active calories today (kcal)',
    category: COUNTER_SENSOR,
    type: INTEGER,
    max: 20000,
  },
  {
    key: 'total_calories',
    name: 'Total calories today (kcal)',
    category: COUNTER_SENSOR,
    type: INTEGER,
    max: 30000,
  },
  { key: 'floors', name: 'Floors today', category: COUNTER_SENSOR, type: INTEGER, max: 2000 },
  {
    key: 'active_zone_minutes',
    name: 'Active zone minutes today',
    category: DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.MINUTES,
    max: 1440,
  },
  {
    key: 'heart_rate',
    name: 'Heart rate (bpm)',
    category: COUNTER_SENSOR,
    type: INTEGER,
    max: 250,
  },
  {
    key: 'resting_heart_rate',
    name: 'Resting heart rate (bpm)',
    category: COUNTER_SENSOR,
    type: INTEGER,
    max: 250,
  },
  {
    key: 'sleep_duration',
    name: 'Sleep duration',
    category: DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.MINUTES,
    max: 1440,
  },
  {
    key: 'sleep_deep',
    name: 'Deep sleep',
    category: DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.MINUTES,
    max: 1440,
  },
  {
    key: 'sleep_rem',
    name: 'REM sleep',
    category: DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.MINUTES,
    max: 1440,
  },
  {
    key: 'sleep_light',
    name: 'Light sleep',
    category: DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.MINUTES,
    max: 1440,
  },
  {
    key: 'sleep_awake',
    name: 'Time awake during sleep',
    category: DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.MINUTES,
    max: 1440,
  },
  { key: 'weight', name: 'Weight (kg)', category: COUNTER_SENSOR, type: DECIMAL, max: 500 },
  {
    key: 'body_fat',
    name: 'Body fat',
    category: UNKNOWN,
    type: DEVICE_FEATURE_TYPES.UNKNOWN.UNKNOWN,
    unit: DEVICE_FEATURE_UNITS.PERCENT,
    max: 100,
  },
  {
    key: 'oxygen_saturation',
    name: 'Oxygen saturation (SpO2)',
    category: UNKNOWN,
    type: DEVICE_FEATURE_TYPES.UNKNOWN.UNKNOWN,
    unit: DEVICE_FEATURE_UNITS.PERCENT,
    max: 100,
  },
  {
    key: 'heart_rate_variability',
    name: 'Heart rate variability',
    category: DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
    unit: DEVICE_FEATURE_UNITS.MILLISECONDS,
    max: 1000,
  },
  {
    key: 'respiratory_rate',
    name: 'Respiratory rate (breaths/min)',
    category: COUNTER_SENSOR,
    type: DECIMAL,
    max: 100,
  },
];

export const FEATURE_KEYS = FEATURES.map((feature) => feature.key);

/** External ids of the account device (`.device`, `.feature(key)`). */
export function accountIds(gladys, healthUserId) {
  return gladys.externalIds(DEVICE_TYPE, healthUserId);
}

/** The discovery payload of a linked account. */
export function buildDevice(gladys, healthUserId) {
  const ids = accountIds(gladys, healthUserId);
  return {
    name: 'Google Health',
    external_id: ids.device,
    // No `poll_frequency`: the integration reads the API on its own timer,
    // at the interval of the configuration, device created or not (the
    // widgets and the scene triggers need the data too).
    should_poll: false,
    features: FEATURES.map((feature) => ({
      name: feature.name,
      external_id: ids.feature(feature.key),
      category: feature.category,
      type: feature.type,
      ...(feature.unit ? { unit: feature.unit } : {}),
      min: 0,
      max: feature.max,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    })),
  };
}

/** The devices to publish: none until an account is linked. */
export function buildDiscoveredDevices(gladys, healthUserId) {
  return healthUserId ? [buildDevice(gladys, healthUserId)] : [];
}

/**
 * The states of a snapshot, for the features the user created in Gladys.
 * @param {object} gladys SDK client (`gladys.devices`: the created devices)
 * @param {string} healthUserId
 * @param {Record<string, number>} values `snapshot.values`
 */
export function buildStates(gladys, healthUserId, values) {
  const ids = accountIds(gladys, healthUserId);
  const created = new Set(
    (gladys.devices ?? [])
      .filter((device) => device.external_id === ids.device)
      .flatMap((device) => (device.features ?? []).map((feature) => feature.external_id)),
  );
  return FEATURES.filter(
    (feature) => values[feature.key] !== undefined && created.has(ids.feature(feature.key)),
  ).map((feature) => ({
    device_feature_external_id: ids.feature(feature.key),
    state: values[feature.key],
  }));
}

/** The transport badge of the account device: cloud, or unreachable. */
export function buildTransports(gladys, healthUserId, reachable) {
  if (!healthUserId) return [];
  return [
    {
      external_id: accountIds(gladys, healthUserId).device,
      transport: reachable ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
    },
  ];
}
