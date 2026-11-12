// -----------------------------------------------------------------------------
// What the integration reads from the Google Health API (v4).
//
// A data type has three spellings: kebab-case in the URL (`heart-rate`),
// snake_case in a filter (`heart_rate`) and camelCase in the JSON (`heartRate`).
// 64-bit integers come as JSON strings ("3822"), doubles as numbers.
// -----------------------------------------------------------------------------

const SCOPE_PREFIX = 'https://www.googleapis.com/auth/googlehealth.';

// Read-only scopes, the only ones requested: the integration can never write
// to the account. Users may grant a subset; a metric whose scope is missing
// simply stays empty.
export const OAUTH_SCOPES = [
  `${SCOPE_PREFIX}activity_and_fitness.readonly`,
  `${SCOPE_PREFIX}health_metrics_and_measurements.readonly`,
  `${SCOPE_PREFIX}sleep.readonly`,
];

const number = (value) => {
  const parsed = Number(value);
  return value === undefined || value === null || !Number.isFinite(parsed) ? undefined : parsed;
};

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Metrics summed per civil day by `dataPoints:dailyRollUp`.
 * `read` receives the roll-up value (`point[jsonKey]`) and returns the number
 * to publish, or `undefined` when the day holds no data.
 */
export const DAILY_METRICS = [
  {
    key: 'steps',
    dataType: 'steps',
    jsonKey: 'steps',
    read: (value) => number(value.countSum),
  },
  {
    key: 'distance',
    dataType: 'distance',
    jsonKey: 'distance',
    // Millimeters -> kilometers.
    read: (value) => {
      const millimeters = number(value.millimetersSum);
      return millimeters === undefined ? undefined : round(millimeters / 1e6, 2);
    },
  },
  {
    key: 'active_calories',
    dataType: 'active-energy-burned',
    jsonKey: 'activeEnergyBurned',
    read: (value) => {
      const kcal = number(value.kcalSum);
      return kcal === undefined ? undefined : round(kcal);
    },
  },
  {
    key: 'total_calories',
    dataType: 'total-calories',
    jsonKey: 'totalCalories',
    read: (value) => {
      const kcal = number(value.kcalSum);
      return kcal === undefined ? undefined : round(kcal);
    },
  },
  {
    key: 'floors',
    dataType: 'floors',
    jsonKey: 'floors',
    read: (value) => number(value.countSum),
  },
  {
    key: 'active_zone_minutes',
    dataType: 'active-zone-minutes',
    jsonKey: 'activeZoneMinutes',
    read: (value) => {
      const zones = [
        value.sumInFatBurnHeartZone,
        value.sumInCardioHeartZone,
        value.sumInPeakHeartZone,
      ]
        .map(number)
        .filter((minutes) => minutes !== undefined);
      return zones.length === 0 ? undefined : zones.reduce((sum, minutes) => sum + minutes, 0);
    },
  },
];

export const DAILY_METRIC_KEYS = DAILY_METRICS.map((metric) => metric.key);

/**
 * Metrics read as "the most recent data point" (`dataPoints` list, newest
 * first). `time` names the filter field and its kind; `lookbackDays` bounds
 * the search; `read` returns the number to publish.
 */
export const LATEST_METRICS = [
  {
    key: 'heart_rate',
    dataType: 'heart-rate',
    jsonKey: 'heartRate',
    time: 'sample',
    lookbackDays: 1,
    read: (value) => number(value.beatsPerMinute),
  },
  {
    key: 'resting_heart_rate',
    dataType: 'daily-resting-heart-rate',
    jsonKey: 'dailyRestingHeartRate',
    time: 'daily',
    lookbackDays: 7,
    read: (value) => number(value.beatsPerMinute),
  },
  {
    key: 'weight',
    dataType: 'weight',
    jsonKey: 'weight',
    time: 'sample',
    lookbackDays: 90,
    // Grams -> kilograms.
    read: (value) => {
      const grams = number(value.weightGrams);
      return grams === undefined ? undefined : round(grams / 1000, 2);
    },
  },
  {
    key: 'body_fat',
    dataType: 'body-fat',
    jsonKey: 'bodyFat',
    time: 'sample',
    lookbackDays: 90,
    read: (value) => {
      const percentage = number(value.percentage);
      return percentage === undefined ? undefined : round(percentage, 1);
    },
  },
  {
    key: 'oxygen_saturation',
    dataType: 'daily-oxygen-saturation',
    jsonKey: 'dailyOxygenSaturation',
    time: 'daily',
    lookbackDays: 7,
    read: (value) => {
      const percentage = number(value.averagePercentage);
      return percentage === undefined ? undefined : round(percentage, 1);
    },
  },
  {
    key: 'heart_rate_variability',
    dataType: 'daily-heart-rate-variability',
    jsonKey: 'dailyHeartRateVariability',
    time: 'daily',
    lookbackDays: 7,
    read: (value) => {
      const milliseconds = number(value.averageHeartRateVariabilityMilliseconds);
      return milliseconds === undefined ? undefined : round(milliseconds, 1);
    },
  },
  {
    key: 'respiratory_rate',
    dataType: 'daily-respiratory-rate',
    jsonKey: 'dailyRespiratoryRate',
    time: 'daily',
    lookbackDays: 7,
    read: (value) => {
      const breaths = number(value.breathsPerMinute);
      return breaths === undefined ? undefined : round(breaths, 1);
    },
  },
];

/** `heart-rate` -> `heart_rate`: the spelling of a data type inside a filter. */
export function filterName(dataType) {
  return dataType.replaceAll('-', '_');
}

export { number as toNumber, round };
