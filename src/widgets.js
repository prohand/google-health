// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
//   daily_summary  the figures of the day: steps against the goal, heart rate,
//                  sleep, calories, distance, weight, and a "Refresh" button;
//   weekly_trend   the last seven days of one metric, as a bar chart.
//
// The content is declarative: the core renders it with its own theme. Texts
// are multi-language objects; numbers follow the unit system of the viewer
// (`units`: 'metric' or 'us').
//
// The widget keys and their settings are stored in the users' dashboards:
// never rename one.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { DAILY_METRIC_KEYS } from './google/dataTypes.js';
import { formatDuration, isValidTimeZone } from './health/time.js';
import { MESSAGES, syncReport } from './messages.js';

const logger = createLogger({ name: 'widgets' });

export const DAILY_SUMMARY_WIDGET = 'daily_summary';
export const WEEKLY_TREND_WIDGET = 'weekly_trend';

const ACTIONS = { SYNC: 'sync' };

const KM_PER_MILE = 1.609344;
const LB_PER_KG = 2.2046226;

const LABELS = {
  steps: { en: 'Steps', fr: 'Pas', de: 'Schritte', es: 'Pasos' },
  distance: { en: 'Distance', fr: 'Distance', de: 'Distanz', es: 'Distancia' },
  active_calories: {
    en: 'Active calories',
    fr: 'Calories actives',
    de: 'Aktive Kalorien',
    es: 'Calorías activas',
  },
  total_calories: { en: 'Calories', fr: 'Calories', de: 'Kalorien', es: 'Calorías' },
  floors: { en: 'Floors', fr: 'Étages', de: 'Etagen', es: 'Pisos' },
  active_zone_minutes: {
    en: 'Active zone minutes',
    fr: 'Minutes en zone active',
    de: 'Aktivzonenminuten',
    es: 'Minutos en zona activa',
  },
  heart_rate: { en: 'Heart rate', fr: 'Fréq. cardiaque', de: 'Herzfrequenz', es: 'Frec. cardíaca' },
  resting_heart_rate: { en: 'Resting HR', fr: 'FC au repos', de: 'Ruhepuls', es: 'FC en reposo' },
  sleep: { en: 'Sleep', fr: 'Sommeil', de: 'Schlaf', es: 'Sueño' },
  weight: { en: 'Weight', fr: 'Poids', de: 'Gewicht', es: 'Peso' },
  account: {
    en: 'Google account',
    fr: 'Compte Google',
    de: 'Google-Konto',
    es: 'Cuenta de Google',
  },
  lastSync: {
    en: 'Last read',
    fr: 'Dernière lecture',
    de: 'Letzter Abruf',
    es: 'Última lectura',
  },
  connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectada' },
  disconnected: {
    en: 'Not connected',
    fr: 'Non connecté',
    de: 'Nicht verbunden',
    es: 'No conectada',
  },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  average: {
    en: 'Daily average',
    fr: 'Moyenne par jour',
    de: 'Tagesdurchschnitt',
    es: 'Media diaria',
  },
  best: { en: 'Best day', fr: 'Meilleur jour', de: 'Bester Tag', es: 'Mejor día' },
  last7Days: { en: '(7 days)', fr: '(7 jours)', de: '(7 Tage)', es: '(7 días)' },
};

const round = (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;

/** A distance in the viewer's unit: `{ value, unit }`. */
function distance(kilometers, units) {
  return units === 'us'
    ? { value: round(kilometers / KM_PER_MILE, 2), unit: 'mi' }
    : { value: round(kilometers, 2), unit: 'km' };
}

function weight(kilograms, units) {
  return units === 'us'
    ? { value: round(kilograms * LB_PER_KG, 1), unit: 'lb' }
    : { value: round(kilograms, 1), unit: 'kg' };
}

/** `08:15`, in the user's time zone (the container runs in UTC). */
function clockTime(iso, timeZone) {
  const options = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  if (isValidTimeZone(timeZone)) options.timeZone = timeZone;
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(iso));
}

/** Every label of a metric with a suffix, e.g. "Steps (7 days)". */
function withSuffix(label, suffix) {
  return Object.fromEntries(
    Object.entries(label).map(([language, text]) => [language, `${text} ${suffix[language]}`]),
  );
}

/** The rows telling whether the account answers, and when it last did. */
function statusComponent(health) {
  const { status, snapshot, config } = health;
  const items = [];
  if (status.state === 'ok') {
    items.push({
      label: LABELS.account,
      icon: 'user-check',
      value: LABELS.connected,
      color: WIDGET_COLORS.SUCCESS,
    });
  } else if (status.state === 'error') {
    items.push({
      label: LABELS.account,
      icon: 'alert-triangle',
      value: LABELS.error,
      color: WIDGET_COLORS.DANGER,
    });
  } else {
    items.push({
      label: LABELS.account,
      icon: 'user-x',
      value: LABELS.disconnected,
      color: WIDGET_COLORS.WARNING,
    });
  }
  if (snapshot) {
    items.push({
      label: LABELS.lastSync,
      icon: 'clock',
      value: clockTime(snapshot.syncedAt, config.timezone),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  return { type: 'status', items };
}

const syncButton = {
  type: 'button',
  label: MESSAGES.syncButton,
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: ACTIONS.SYNC },
};

/** What a widget shows when there is nothing to show yet. */
function emptyContent(health) {
  const components = [
    { type: 'text', variant: 'body', text: health.status.message ?? MESSAGES.noData },
    statusComponent(health),
  ];
  if (health.status.state !== 'missing_client' && health.status.state !== 'not_linked') {
    components.push(syncButton);
  }
  return { ttl_seconds: 60, components };
}

function dailySummary(health, units) {
  const { snapshot, config } = health;
  if (!snapshot) return emptyContent(health);
  const { values } = snapshot;
  const tiles = [];

  if (values.steps !== undefined) {
    tiles.push({
      type: 'gauge',
      label: LABELS.steps,
      value: values.steps,
      min: 0,
      // A gauge past its maximum is refused: the goal grows with the steps.
      max: Math.max(config.steps_goal, values.steps),
      color: values.steps >= config.steps_goal ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.PRIMARY,
    });
  }
  const heartRate = values.heart_rate ?? values.resting_heart_rate;
  if (heartRate !== undefined) {
    tiles.push({
      type: 'value',
      label: values.heart_rate !== undefined ? LABELS.heart_rate : LABELS.resting_heart_rate,
      icon: 'heart',
      value: heartRate,
      unit: 'bpm',
      color: WIDGET_COLORS.DANGER,
    });
  }
  if (values.sleep_duration !== undefined) {
    tiles.push({
      type: 'value',
      label: LABELS.sleep,
      icon: 'moon',
      value: formatDuration(values.sleep_duration),
      color:
        values.sleep_duration >= config.sleep_goal * 60
          ? WIDGET_COLORS.SUCCESS
          : WIDGET_COLORS.INFO,
    });
  }
  const calories = values.total_calories ?? values.active_calories;
  if (calories !== undefined) {
    tiles.push({
      type: 'value',
      label: values.total_calories !== undefined ? LABELS.total_calories : LABELS.active_calories,
      icon: 'zap',
      value: calories,
      unit: 'kcal',
    });
  }
  if (values.distance !== undefined) {
    tiles.push({
      type: 'value',
      label: LABELS.distance,
      icon: 'map-pin',
      ...distance(values.distance, units),
    });
  }
  if (values.weight !== undefined) {
    tiles.push({
      type: 'value',
      label: LABELS.weight,
      icon: 'activity',
      ...weight(values.weight, units),
    });
  }

  const components = [...tiles, statusComponent(health), syncButton];
  if (tiles.length === 0) {
    components.unshift({ type: 'text', variant: 'body', text: MESSAGES.noData });
  }
  return {
    // The integration nudges the widget after every read: the TTL is only
    // the safety net.
    ttl_seconds: Math.min(3600, Math.max(60, config.poll_frequency)),
    components,
  };
}

function weeklyTrend(health, settings, units) {
  const { snapshot, config } = health;
  const metric = DAILY_METRIC_KEYS.includes(settings?.metric) ? settings.metric : 'steps';
  const series = snapshot?.daily?.[metric];
  if (!series || series.length === 0) return emptyContent(health);

  const convert = (value) => (metric === 'distance' ? distance(value, units).value : value);
  let unit;
  if (metric === 'distance') unit = distance(0, units).unit;
  if (metric === 'active_calories' || metric === 'total_calories') unit = 'kcal';
  if (metric === 'active_zone_minutes') unit = 'min';
  const digits = metric === 'distance' ? 1 : 0;

  const points = series.map(({ date, value }) => ({
    // Noon UTC: the same civil day for every viewer, whatever their offset.
    t: `${date}T12:00:00.000Z`,
    v: convert(value),
  }));
  const total = points.reduce((sum, point) => sum + point.v, 0);
  const best = Math.max(...points.map((point) => point.v));

  return {
    ttl_seconds: Math.min(3600, Math.max(60, config.poll_frequency)),
    components: [
      {
        type: 'chart',
        chart_type: 'bar',
        title: withSuffix(LABELS[metric], LABELS.last7Days),
        ...(unit ? { unit } : {}),
        series: [{ name: LABELS[metric], points }],
      },
      {
        type: 'value',
        label: LABELS.average,
        icon: 'bar-chart-2',
        value: round(total / points.length, digits),
        ...(unit ? { unit } : {}),
      },
      {
        type: 'value',
        label: LABELS.best,
        icon: 'award',
        value: round(best, digits),
        ...(unit ? { unit } : {}),
        color: WIDGET_COLORS.SUCCESS,
      },
    ],
  };
}

/** The "Refresh" button, shared by the widgets that show it. */
async function runAction(health, widgetKey, actionKey) {
  logger.info(`onWidgetAction <- ${widgetKey}.${actionKey}`);
  if (actionKey !== ACTIONS.SYNC) {
    // Throwing acks the action as failed: the message reaches the user.
    throw new Error(`Unknown widget action: ${actionKey}`);
  }
  return syncReport(await health.sync());
}

/**
 * Handlers of the manifest `widgets`, keyed by their `key`.
 * `health` is the application (src/app.js): `status`, `snapshot`, `config`
 * and `sync()`.
 */
export const WIDGETS = {
  [DAILY_SUMMARY_WIDGET]: {
    async get(_gladys, { units, health }) {
      return dailySummary(health, units);
    },
    action(_gladys, { actionKey, health }) {
      return runAction(health, DAILY_SUMMARY_WIDGET, actionKey);
    },
  },
  [WEEKLY_TREND_WIDGET]: {
    async get(_gladys, { settings, units, health }) {
      return weeklyTrend(health, settings, units);
    },
    action(_gladys, { actionKey, health }) {
      return runAction(health, WEEKLY_TREND_WIDGET, actionKey);
    },
  },
};

/** Ask the core to re-pull every widget now (rate-limited core-side). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
