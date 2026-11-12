// -----------------------------------------------------------------------------
// One read of the Google Health API, turned into what the rest of the
// integration works with: the "snapshot".
//
//   {
//     syncedAt: '2026-03-04T08:00:00.000Z',
//     day: '2026-03-04',                      // today, in the user's time zone
//     values: { steps: 3822, heart_rate: 61, sleep_duration: 407, ... },
//     daily: { steps: [{ date: '2026-02-26', value: 9120 }, ...], ... },
//     sleep:   { id, endTime, minutesAsleep, ... } | null,
//     weight:  { id, time, kilograms } | null,
//     workout: { id, name, type, endTime, durationMinutes, ... } | null,
//     errors: [{ metric, status, message }],  // metrics that could not be read
//   }
//
// A metric the account has no data for, or no permission for, is absent from
// `values`: it never fails the whole read. The read only throws when nothing
// could be read at all.
// -----------------------------------------------------------------------------

import { DAILY_METRICS, LATEST_METRICS, filterName, round, toNumber } from '../google/dataTypes.js';
import { addDays, civilDay, fromCivilDate } from './time.js';

// Days of history kept for the trend widget, today included.
export const HISTORY_DAYS = 7;
// Requests sent at the same time (the API allows 300 a minute per user).
const CONCURRENCY = 4;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Run the tasks a few at a time; resolves the `allSettled` results in order. */
async function settleAll(tasks) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
  return results;
}

/** The instant a data point was measured (ms), whatever its time shape. */
function pointTime(value) {
  const iso = value?.sampleTime?.physicalTime ?? value?.interval?.endTime;
  if (iso) return Date.parse(iso);
  const day = fromCivilDate(value?.date);
  return day ? Date.parse(`${day}T00:00:00Z`) : NaN;
}

/** The most recent data point of a list, as `{ point, value, time }`. */
function latestPoint(points, jsonKey) {
  let latest;
  for (const point of points) {
    const value = point?.[jsonKey];
    if (!value) continue;
    const time = pointTime(value);
    if (!latest || (Number.isFinite(time) && time > latest.time)) {
      latest = { point, value, time };
    }
  }
  return latest;
}

const pointId = (point, fallback) => point.name ?? point.dataPointName ?? fallback;

/** `"900s"` -> 15 (minutes). */
function durationMinutes(duration) {
  const seconds = toNumber(String(duration ?? '').replace(/s$/, ''));
  return seconds === undefined ? undefined : Math.round(seconds / 60);
}

function readDailyMetric(metric, points, firstDay, today) {
  const byDay = new Map();
  for (const point of points) {
    const day = fromCivilDate(point?.civilStartTime?.date);
    const raw = point?.[metric.jsonKey];
    const value = raw ? metric.read(raw) : undefined;
    if (day && value !== undefined) byDay.set(day, value);
  }
  const series = [];
  for (let day = firstDay; day <= today; day = addDays(day, 1)) {
    // A day without a roll-up point holds no data: zero steps, not "unknown".
    series.push({ date: day, value: byDay.get(day) ?? 0 });
  }
  return series;
}

function readSleep(points) {
  const sessions = points.filter((point) => point?.sleep?.interval?.endTime);
  // Naps are sessions too: prefer the main sleep of the night when flagged.
  const main = sessions.filter((point) => point.sleep.metadata?.main === true);
  const latest = latestPoint(main.length > 0 ? main : sessions, 'sleep');
  if (!latest) return null;
  const { value: sleep, point } = latest;
  const summary = sleep.summary ?? {};
  const stages = Object.fromEntries(
    (summary.stagesSummary ?? []).map((stage) => [stage.type, toNumber(stage.minutes)]),
  );
  const start = Date.parse(sleep.interval.startTime);
  const end = Date.parse(sleep.interval.endTime);
  const minutesAsleep =
    toNumber(summary.minutesAsleep) ??
    (Number.isFinite(start) && Number.isFinite(end)
      ? Math.round((end - start) / 60000)
      : undefined);
  if (minutesAsleep === undefined) return null;
  return {
    id: pointId(point, sleep.interval.endTime),
    startTime: sleep.interval.startTime,
    endTime: sleep.interval.endTime,
    minutesAsleep,
    minutesAwake: toNumber(summary.minutesAwake) ?? stages.AWAKE,
    minutesDeep: stages.DEEP,
    minutesRem: stages.REM,
    minutesLight: stages.LIGHT,
  };
}

function readWorkout(points) {
  const latest = latestPoint(points, 'exercise');
  if (!latest) return null;
  const { value: exercise, point } = latest;
  const metrics = exercise.metricsSummary ?? {};
  const start = Date.parse(exercise.interval?.startTime);
  const end = Date.parse(exercise.interval?.endTime);
  // The docs spell the distance field both ways.
  const millimeters = toNumber(metrics.distanceMillimeters ?? metrics.distanceMillimiters);
  const calories = toNumber(metrics.caloriesKcal);
  return {
    id: pointId(point, exercise.interval?.endTime),
    name: exercise.displayName || exercise.exerciseType || 'Exercise',
    type: exercise.exerciseType || 'UNKNOWN',
    endTime: exercise.interval?.endTime,
    durationMinutes:
      durationMinutes(exercise.activeDuration) ??
      (Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 60000) : 0),
    calories: calories === undefined ? 0 : Math.round(calories),
    distanceKm: millimeters === undefined ? 0 : round(millimeters / 1e6, 2),
  };
}

function latestFilter(metric, now) {
  const name = filterName(metric.dataType);
  const since = new Date(now - metric.lookbackDays * DAY_MS);
  return metric.time === 'daily'
    ? `${name}.date >= "${since.toISOString().slice(0, 10)}"`
    : `${name}.sample_time.physical_time >= "${since.toISOString()}"`;
}

/**
 * Read everything from the API.
 * @param {ReturnType<import('../google/client.js').createHealthClient>} client
 * @param {object} [options]
 * @param {string} [options.timeZone] IANA time zone of the user
 * @param {number} [options.now] current instant, in milliseconds
 */
export async function fetchSnapshot(client, { timeZone, now = Date.now() } = {}) {
  const today = civilDay(new Date(now), timeZone);
  const firstDay = addDays(today, -(HISTORY_DAYS - 1));
  const tomorrow = addDays(today, 1);

  const tasks = [
    ...DAILY_METRICS.map((metric) => ({
      metric: metric.key,
      run: () => client.dailyRollUp(metric.dataType, firstDay, tomorrow),
    })),
    ...LATEST_METRICS.map((metric) => ({
      metric: metric.key,
      run: () =>
        client.listDataPoints(metric.dataType, { filter: latestFilter(metric, now), pageSize: 5 }),
    })),
    {
      metric: 'sleep',
      run: () =>
        client.listDataPoints('sleep', {
          filter: `sleep.interval.end_time >= "${new Date(now - 36 * HOUR_MS).toISOString()}"`,
          pageSize: 10,
        }),
    },
    {
      metric: 'workout',
      run: () =>
        client.listDataPoints('exercise', {
          filter: `exercise.interval.start_time >= "${new Date(now - 7 * DAY_MS).toISOString()}"`,
          pageSize: 5,
        }),
    },
  ];

  const results = await settleAll(tasks.map((task) => task.run));
  const errors = [];
  const resultOf = (metricKey) => {
    const index = tasks.findIndex((task) => task.metric === metricKey);
    const result = results[index];
    if (result.status === 'rejected') {
      errors.push({
        metric: metricKey,
        status: result.reason?.status,
        message: result.reason?.message ?? String(result.reason),
      });
      return undefined;
    }
    return result.value;
  };

  const values = {};
  const daily = {};

  for (const metric of DAILY_METRICS) {
    const points = resultOf(metric.key);
    if (!points) continue;
    daily[metric.key] = readDailyMetric(metric, points, firstDay, today);
    values[metric.key] = daily[metric.key].at(-1).value;
  }

  let weight = null;
  for (const metric of LATEST_METRICS) {
    const points = resultOf(metric.key);
    const latest = points && latestPoint(points, metric.jsonKey);
    const value = latest && metric.read(latest.value);
    if (value === undefined || value === null) continue;
    values[metric.key] = value;
    if (metric.key === 'weight') {
      const time = latest.value.sampleTime?.physicalTime;
      weight = { id: pointId(latest.point, time), time, kilograms: value };
    }
  }

  const sleepPoints = resultOf('sleep');
  const sleep = sleepPoints ? readSleep(sleepPoints) : null;
  if (sleep) {
    values.sleep_duration = sleep.minutesAsleep;
    if (sleep.minutesDeep !== undefined) values.sleep_deep = sleep.minutesDeep;
    if (sleep.minutesRem !== undefined) values.sleep_rem = sleep.minutesRem;
    if (sleep.minutesLight !== undefined) values.sleep_light = sleep.minutesLight;
    if (sleep.minutesAwake !== undefined) values.sleep_awake = sleep.minutesAwake;
  }

  const workoutPoints = resultOf('workout');
  const workout = workoutPoints ? readWorkout(workoutPoints) : null;

  if (errors.length === tasks.length) {
    // Nothing answered: an account problem, not a missing metric. Let the
    // caller see the real error (the first one is as good as any).
    throw results[0].reason;
  }

  return {
    syncedAt: new Date(now).toISOString(),
    day: today,
    values,
    daily,
    sleep,
    weight,
    workout,
    errors,
  };
}
