// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// TRIGGERS say "this happened": the step goal was reached, a night of sleep, a
// weigh-in or a workout was recorded. They are found by comparing a fresh
// snapshot with what was already announced (src/health/memory.js): one event
// per fact, never one per read.
//
// ACTIONS are operations a scene runs: read the account now, or get the
// figures of the day (and a ready-made sentence) for the next actions.
//
// Every key below is stored in the users' scenes: never rename one.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './i18n.js';
import { dailySummaryText } from './messages.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_TRIGGERS = {
  STEPS_GOAL_REACHED: 'steps_goal_reached',
  SLEEP_RECORDED: 'sleep_recorded',
  WEIGHT_RECORDED: 'weight_recorded',
  WORKOUT_RECORDED: 'workout_recorded',
};

// Values of the trigger filters (the `options` of the manifest fields).
export const SLEEP_QUALITIES = { GOAL_REACHED: 'goal_reached', GOAL_MISSED: 'goal_missed' };
export const WEIGHT_TRENDS = { UP: 'up', DOWN: 'down', STABLE: 'stable' };

// A weigh-in within 100 g of the previous one is "stable".
const WEIGHT_STABLE_KG = 0.1;

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Compare a snapshot with the memory.
 * @returns {{ events: { key: string, data: object }[], memory: object }}
 *   the events to fire and the memory to keep
 */
export function detectEvents(memory, snapshot, config) {
  const events = [];
  const next = { ...memory, initialized: true };
  // The very first read only takes note: yesterday's sleep or last month's
  // weigh-in did not "just happen".
  const announce = memory.initialized === true;

  const steps = snapshot.values.steps;
  if (steps !== undefined && steps >= config.steps_goal && memory.stepsGoalDay !== snapshot.day) {
    next.stepsGoalDay = snapshot.day;
    if (announce) {
      events.push({
        key: SCENE_TRIGGERS.STEPS_GOAL_REACHED,
        data: { steps, goal: config.steps_goal },
      });
    }
  }

  const { sleep, weight, workout } = snapshot;

  if (sleep && sleep.id !== memory.sleepId) {
    next.sleepId = sleep.id;
    if (announce) {
      events.push({
        key: SCENE_TRIGGERS.SLEEP_RECORDED,
        data: {
          quality:
            sleep.minutesAsleep >= config.sleep_goal * 60
              ? SLEEP_QUALITIES.GOAL_REACHED
              : SLEEP_QUALITIES.GOAL_MISSED,
          duration_minutes: sleep.minutesAsleep,
          duration_hours: round(sleep.minutesAsleep / 60, 1),
          deep_minutes: sleep.minutesDeep ?? null,
          rem_minutes: sleep.minutesRem ?? null,
        },
      });
    }
  }

  if (weight && weight.id !== memory.weightId) {
    const previous = memory.weightKilograms;
    const change = typeof previous === 'number' ? round(weight.kilograms - previous, 2) : 0;
    next.weightId = weight.id;
    next.weightKilograms = weight.kilograms;
    if (announce) {
      let trend = WEIGHT_TRENDS.STABLE;
      if (change > WEIGHT_STABLE_KG) trend = WEIGHT_TRENDS.UP;
      if (change < -WEIGHT_STABLE_KG) trend = WEIGHT_TRENDS.DOWN;
      events.push({
        key: SCENE_TRIGGERS.WEIGHT_RECORDED,
        data: { trend, weight_kg: weight.kilograms, change_kg: change },
      });
    }
  }

  if (workout && workout.id !== memory.workoutId) {
    next.workoutId = workout.id;
    if (announce) {
      events.push({
        key: SCENE_TRIGGERS.WORKOUT_RECORDED,
        data: {
          name: workout.name,
          exercise_type: workout.type,
          duration_minutes: workout.durationMinutes,
          calories: workout.calories,
          distance_km: workout.distanceKm,
        },
      });
    }
  }

  return { events, memory: next };
}

/** The outputs of `get_daily_summary`: scalars only, `null` when unknown. */
function summaryOutputs(snapshot, config, language) {
  const { values } = snapshot;
  const orNull = (value) => value ?? null;
  return {
    steps: orNull(values.steps),
    steps_goal_reached: values.steps !== undefined && values.steps >= config.steps_goal,
    distance_km: orNull(values.distance),
    active_calories: orNull(values.active_calories),
    total_calories: orNull(values.total_calories),
    heart_rate: orNull(values.heart_rate),
    resting_heart_rate: orNull(values.resting_heart_rate),
    sleep_minutes: orNull(values.sleep_duration),
    weight_kg: orNull(values.weight),
    summary: dailySummaryText(snapshot, config, language),
  };
}

/**
 * Handlers of the manifest `scene_actions`, keyed by their `key`.
 * `health` is the application (src/app.js): `sync()` reads the account and
 * resolves the snapshot, `snapshot` is the last one read, `config` the
 * current configuration.
 */
export const SCENE_ACTIONS = {
  async sync_now(_gladys, { health }) {
    logger.info('Scene action sync_now');
    // Throwing fails this action only; the scene continues.
    const snapshot = await health.sync();
    return {
      steps: snapshot.values.steps ?? null,
      synced_at: snapshot.syncedAt,
    };
  },

  async get_daily_summary(_gladys, { fields, health }) {
    logger.info('Scene action get_daily_summary');
    const snapshot = health.snapshot ?? (await health.sync());
    const language = LANGUAGES.includes(fields?.language) ? fields.language : 'en';
    return summaryOutputs(snapshot, health.config, language);
  },
};
