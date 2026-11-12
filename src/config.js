// -----------------------------------------------------------------------------
// Integration configuration.
//
// The user fills the `config_schema` of the manifest in Gladys; the SDK hands
// it over (`gladys.getConfig()`, `gladys.onConfigUpdated()`). This module gives
// every key a default and a type, so the rest of the code never meets
// `undefined` or a number typed as a string.
//
// The OAuth tokens live in the same configuration, under keys the manifest does
// not declare: Gladys stores them but never shows them (see src/google/oauth.js).
// -----------------------------------------------------------------------------

// Defaults: they MUST match the `default` values of the manifest
// `config_schema` (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  client_id: '',
  client_secret: '',
  // Seconds between two reads of the Google Health API.
  poll_frequency: 900,
  // Daily goals: the widget gauges and the "goal reached" scene triggers.
  steps_goal: 10000,
  sleep_goal: 8,
  // IANA time zone of the user ("Europe/Paris"): where a day starts and ends.
  // Empty: the time zone of the container (UTC unless TZ is set).
  timezone: '',
};

// Bounds of the manifest fields, applied again here: the configuration can
// also be written through the Gladys API, without the form checks.
const LIMITS = {
  poll_frequency: [300, 21600],
  steps_goal: [100, 100000],
  sleep_goal: [1, 16],
};

// Keys the integration writes itself with `setConfig` (not in the manifest).
export const TOKEN_KEYS = [
  'access_token',
  'refresh_token',
  'token_expires_at',
  'granted_scopes',
  'health_user_id',
];

function boundedNumber(value, key) {
  const number = Number(value);
  const [min, max] = LIMITS[key];
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) {
    return DEFAULT_CONFIG[key];
  }
  return Math.min(max, Math.max(min, number));
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Merge the stored configuration with the defaults.
 * @param {Record<string, unknown>} raw configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    client_id: text(raw.client_id),
    client_secret: text(raw.client_secret),
    poll_frequency: boundedNumber(raw.poll_frequency, 'poll_frequency'),
    steps_goal: Math.round(boundedNumber(raw.steps_goal, 'steps_goal')),
    sleep_goal: boundedNumber(raw.sleep_goal, 'sleep_goal'),
    timezone: text(raw.timezone),
    access_token: text(raw.access_token),
    refresh_token: text(raw.refresh_token),
    token_expires_at: Number(raw.token_expires_at) || 0,
    granted_scopes: text(raw.granted_scopes),
    health_user_id: text(raw.health_user_id),
  };
}

// Keys the user owns: a change of one of them calls for a new read.
export const USER_KEYS = [
  'client_id',
  'client_secret',
  'poll_frequency',
  'steps_goal',
  'sleep_goal',
  'timezone',
];

/** The values that forget the linked account. */
export const NO_TOKENS = {
  access_token: '',
  refresh_token: '',
  token_expires_at: 0,
  granted_scopes: '',
  health_user_id: '',
};

/** Whether the user typed the OAuth client of their Google Cloud project. */
export function hasClient(config) {
  return config.client_id !== '' && config.client_secret !== '';
}

/** Whether a Google account is linked (a refresh token is all it takes). */
export function isLinked(config) {
  return hasClient(config) && config.refresh_token !== '';
}
