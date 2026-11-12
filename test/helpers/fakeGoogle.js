// -----------------------------------------------------------------------------
// A fake Google, for the tests: the token endpoint and the Health API behind
// one `fetch`. No network. Edit `google.data` to change what the account
// holds, `google.failures` to make a data type fail, and read `google.calls`
// to see what was asked.
// -----------------------------------------------------------------------------

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const apiError = (code, status, message, reason) =>
  json(code, {
    error: {
      code,
      message,
      status,
      ...(reason
        ? { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] }
        : {}),
    },
  });

const civil = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
};

/** A daily roll-up point, as the API sends it. */
export const rollup = (isoDate, jsonKey, value) => ({
  civilStartTime: { date: civil(isoDate), time: {} },
  civilEndTime: { date: civil(isoDate), time: { hours: 23, minutes: 59, seconds: 59 } },
  [jsonKey]: value,
});

/** An account with a bit of everything, "today" being 2026-03-04. */
export function sampleData() {
  return {
    rollups: {
      steps: [
        rollup('2026-03-04', 'steps', { countSum: '3822' }),
        rollup('2026-03-03', 'steps', { countSum: '11250' }),
        rollup('2026-03-01', 'steps', { countSum: '8000' }),
      ],
      distance: [rollup('2026-03-04', 'distance', { millimetersSum: '2954000' })],
      'active-energy-burned': [rollup('2026-03-04', 'activeEnergyBurned', { kcalSum: 412.6 })],
      'total-calories': [rollup('2026-03-04', 'totalCalories', { kcalSum: 1890.2 })],
      floors: [rollup('2026-03-04', 'floors', { countSum: '7' })],
      'active-zone-minutes': [
        rollup('2026-03-04', 'activeZoneMinutes', {
          sumInFatBurnHeartZone: '12',
          sumInCardioHeartZone: '6',
          sumInPeakHeartZone: '2',
        }),
      ],
    },
    points: {
      'heart-rate': [
        {
          heartRate: {
            sampleTime: { physicalTime: '2026-03-04T07:58:00Z', utcOffset: '3600s' },
            beatsPerMinute: '64',
          },
        },
        {
          heartRate: {
            sampleTime: { physicalTime: '2026-03-04T07:57:00Z', utcOffset: '3600s' },
            beatsPerMinute: '70',
          },
        },
      ],
      'daily-resting-heart-rate': [
        { dailyRestingHeartRate: { date: civil('2026-03-04'), beatsPerMinute: '58' } },
      ],
      weight: [
        {
          name: 'users/1/dataTypes/weight/dataPoints/w1',
          weight: { sampleTime: { physicalTime: '2026-03-02T06:30:00Z' }, weightGrams: 72400 },
        },
      ],
      'body-fat': [
        { bodyFat: { sampleTime: { physicalTime: '2026-03-02T06:30:00Z' }, percentage: 19.44 } },
      ],
      'daily-oxygen-saturation': [
        { dailyOxygenSaturation: { date: civil('2026-03-04'), averagePercentage: 96.2 } },
      ],
      'daily-heart-rate-variability': [
        {
          dailyHeartRateVariability: {
            date: civil('2026-03-04'),
            averageHeartRateVariabilityMilliseconds: 41.26,
          },
        },
      ],
      'daily-respiratory-rate': [
        { dailyRespiratoryRate: { date: civil('2026-03-04'), breathsPerMinute: 14.8 } },
      ],
      sleep: [
        {
          name: 'users/1/dataTypes/sleep/dataPoints/s1',
          sleep: {
            interval: { startTime: '2026-03-03T21:57:30Z', endTime: '2026-03-04T05:41:30Z' },
            type: 'STAGES',
            metadata: { main: true },
            summary: {
              minutesAsleep: '407',
              minutesAwake: '57',
              stagesSummary: [
                { type: 'AWAKE', minutes: '57', count: '12' },
                { type: 'LIGHT', minutes: '230', count: '20' },
                { type: 'DEEP', minutes: '82', count: '4' },
                { type: 'REM', minutes: '95', count: '5' },
              ],
            },
          },
        },
      ],
      exercise: [
        {
          name: 'users/1/dataTypes/exercise/dataPoints/e1',
          exercise: {
            interval: { startTime: '2026-03-03T17:00:00Z', endTime: '2026-03-03T17:35:00Z' },
            exerciseType: 'RUNNING',
            displayName: 'Evening run',
            activeDuration: '1980s',
            metricsSummary: { caloriesKcal: 345.4, distanceMillimeters: 5210000 },
          },
        },
      ],
    },
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.data] what the account holds (default: sampleData())
 */
export function createFakeGoogle({ data = sampleData() } = {}) {
  const google = {
    data,
    // dataType -> Response factory, e.g. { weight: () => google.error(403, ...) }
    failures: {},
    // Set to a Response factory to make every Health API call fail.
    apiFailure: null,
    // Set to a Response factory to make the token endpoint fail.
    tokenFailure: null,
    identity: { name: 'users/me/identity', healthUserId: '111111256096816351' },
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    calls: [],
    tokenRequests: [],
    revoked: [],
    error: apiError,

    async fetch(input, init = {}) {
      const url = new URL(String(input));
      const method = init.method ?? 'GET';
      google.calls.push({ method, url: url.toString(), headers: init.headers, body: init.body });

      if (url.href === 'https://oauth2.googleapis.com/token') {
        const params = Object.fromEntries(new URLSearchParams(init.body));
        google.tokenRequests.push(params);
        if (google.tokenFailure) return google.tokenFailure(params);
        return json(200, {
          access_token: google.accessToken,
          expires_in: 3599,
          ...(params.grant_type === 'authorization_code'
            ? { refresh_token: google.refreshToken }
            : {}),
          scope: 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
          token_type: 'Bearer',
        });
      }
      if (url.href === 'https://oauth2.googleapis.com/revoke') {
        google.revoked.push(new URLSearchParams(init.body).get('token'));
        return json(200, {});
      }
      if (url.origin !== 'https://health.googleapis.com') {
        throw new Error(`Unexpected request to ${url.origin}`);
      }
      if (init.headers?.authorization !== `Bearer ${google.accessToken}`) {
        return apiError(401, 'UNAUTHENTICATED', 'Invalid credentials');
      }
      if (google.apiFailure) return google.apiFailure(url);
      if (url.pathname === '/v4/users/me/identity') {
        return json(200, google.identity);
      }
      const match = url.pathname.match(
        /^\/v4\/users\/me\/dataTypes\/([a-z0-9-]+)\/dataPoints(:dailyRollUp)?$/,
      );
      if (!match) return apiError(404, 'NOT_FOUND', 'Not found');
      const [, dataType, rollUp] = match;
      if (google.failures[dataType]) return google.failures[dataType](url);
      if (rollUp) {
        if (method !== 'POST') return apiError(404, 'NOT_FOUND', 'Not found');
        return json(200, { rollupDataPoints: google.data.rollups[dataType] ?? [] });
      }
      return json(200, { dataPoints: google.data.points[dataType] ?? [], nextPageToken: '' });
    },
  };
  google.fetch = google.fetch.bind(google);
  return google;
}

/** 2026-03-04 08:00 UTC: "now" of the sample account. */
export const NOW = Date.parse('2026-03-04T08:00:00Z');

/** An in-memory memory store (src/health/memory.js) for the tests. */
export function createFakeMemoryStore(initial) {
  const store = {
    memory: initial,
    saves: 0,
    async load() {
      return {
        initialized: false,
        stepsGoalDay: null,
        sleepId: null,
        weightId: null,
        weightKilograms: null,
        workoutId: null,
        ...store.memory,
      };
    },
    async save(memory) {
      store.memory = memory;
      store.saves += 1;
    },
  };
  return store;
}
