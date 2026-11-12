import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { createHealthClient } from '../src/google/client.js';
import { DAILY_METRIC_KEYS } from '../src/google/dataTypes.js';
import { fetchSnapshot } from '../src/health/snapshot.js';
import { LANGUAGES } from '../src/i18n.js';
import { MESSAGES } from '../src/messages.js';
import { DAILY_SUMMARY_WIDGET, WEEKLY_TREND_WIDGET, WIDGETS } from '../src/widgets.js';
import { NOW, createFakeGoogle } from './helpers/fakeGoogle.js';

const config = normalizeConfig({ timezone: 'Europe/Paris' });

async function sampleSnapshot() {
  const google = createFakeGoogle();
  const client = createHealthClient({
    getAccessToken: async () => google.accessToken,
    fetch: google.fetch,
  });
  return fetchSnapshot(client, { timeZone: 'Europe/Paris', now: NOW });
}

const healthOf = (overrides = {}) => ({
  config,
  snapshot: null,
  status: { state: 'ok' },
  sync: async () => assert.fail('unexpected read'),
  ...overrides,
});

const get = (key, health, request = {}) =>
  WIDGETS[key].get(null, { settings: {}, language: 'en', units: 'metric', ...request, health });

const ofType = (content, type) => content.components.filter((c) => c.type === type);

/** Every multi-language object of a content carries the four languages. */
function assertFourLanguages(node, path = 'content') {
  if (Array.isArray(node)) {
    node.forEach((item, index) => assertFourLanguages(item, `${path}[${index}]`));
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      assert.deepEqual(Object.keys(node).sort(), [...LANGUAGES].sort(), path);
    } else {
      for (const [key, value] of Object.entries(node)) assertFourLanguages(value, `${path}.${key}`);
    }
  }
}

test('the daily summary renders exactly as sent', async () => {
  const content = await get(DAILY_SUMMARY_WIDGET, healthOf({ snapshot: await sampleSnapshot() }));
  assert.deepEqual(validateWidgetContent(content), []);
  assertFourLanguages(content);

  const [gauge] = ofType(content, 'gauge');
  assert.equal(gauge.value, 3822);
  assert.equal(gauge.max, 10000);
  const tiles = Object.fromEntries(ofType(content, 'value').map((t) => [t.label.en, t]));
  assert.equal(tiles['Heart rate'].value, 64);
  assert.equal(tiles.Sleep.value, '6 h 47');
  assert.equal(tiles.Calories.value, 1890);
  assert.deepEqual([tiles.Distance.value, tiles.Distance.unit], [2.95, 'km']);
  assert.deepEqual([tiles.Weight.value, tiles.Weight.unit], [72.4, 'kg']);

  const [status] = ofType(content, 'status');
  assert.equal(status.items[0].value.en, 'Connected');
  // 08:00 UTC, shown in the time zone of the configuration.
  assert.equal(status.items[1].value, '09:00');
  assert.equal(ofType(content, 'button')[0].action.key, 'sync');
});

test('the daily summary follows the unit system of the viewer', async () => {
  const health = healthOf({ snapshot: await sampleSnapshot() });
  const content = await get(DAILY_SUMMARY_WIDGET, health, { units: 'us' });
  assert.deepEqual(validateWidgetContent(content), []);
  const tiles = Object.fromEntries(ofType(content, 'value').map((t) => [t.label.en, t]));
  assert.deepEqual([tiles.Distance.value, tiles.Distance.unit], [1.83, 'mi']);
  assert.deepEqual([tiles.Weight.value, tiles.Weight.unit], [159.6, 'lb']);
});

test('a goal passed does not overflow the gauge', async () => {
  const snapshot = await sampleSnapshot();
  snapshot.values.steps = 14200;
  const [gauge] = ofType(await get(DAILY_SUMMARY_WIDGET, healthOf({ snapshot })), 'gauge');
  assert.equal(gauge.max, 14200);
  assert.equal(gauge.color, 'success');
});

test('without an account the widgets say what to do, with no refresh button', async () => {
  for (const key of Object.keys(WIDGETS)) {
    const health = healthOf({ status: { state: 'not_linked', message: MESSAGES.notLinked } });
    const content = await get(key, health);
    assert.deepEqual(validateWidgetContent(content), [], key);
    assertFourLanguages(content);
    assert.deepEqual(ofType(content, 'text')[0].text, MESSAGES.notLinked);
    assert.equal(ofType(content, 'button').length, 0);
  }
});

test('after a failed read the widget shows the error and offers to retry', async () => {
  const health = healthOf({ status: { state: 'error', message: MESSAGES.unreachable } });
  const content = await get(DAILY_SUMMARY_WIDGET, health);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(ofType(content, 'status')[0].items[0].color, 'danger');
  assert.equal(ofType(content, 'button').length, 1);
});

test('the weekly trend draws seven bars for every metric of its setting', async () => {
  const health = healthOf({ snapshot: await sampleSnapshot() });
  for (const metric of DAILY_METRIC_KEYS) {
    const content = await get(WEEKLY_TREND_WIDGET, health, { settings: { metric } });
    assert.deepEqual(validateWidgetContent(content), [], metric);
    assertFourLanguages(content);
    const [chart] = ofType(content, 'chart');
    assert.equal(chart.chart_type, 'bar');
    assert.equal(chart.series[0].points.length, 7, metric);
  }
  const steps = await get(WEEKLY_TREND_WIDGET, health, { settings: {} });
  const [chart] = ofType(steps, 'chart');
  assert.deepEqual(chart.series[0].points.at(-1), { t: '2026-03-04T12:00:00.000Z', v: 3822 });
  const [average, best] = ofType(steps, 'value');
  assert.equal(average.value, Math.round((8000 + 11250 + 3822) / 7));
  assert.equal(best.value, 11250);
});

test('the refresh button reads the account and answers a toast', async () => {
  const snapshot = await sampleSnapshot();
  let reads = 0;
  const health = healthOf({
    sync: async () => {
      reads += 1;
      return snapshot;
    },
  });
  for (const key of Object.keys(WIDGETS)) {
    const toast = await WIDGETS[key].action(null, { actionKey: 'sync', params: {}, health });
    assert.deepEqual(Object.keys(toast).sort(), [...LANGUAGES].sort());
    assert.match(toast.en, /18 metrics read/);
    for (const text of Object.values(toast)) assert.ok(text.length <= 200, text);
    await assert.rejects(WIDGETS[key].action(null, { actionKey: 'nope', health }), /Unknown/);
  }
  assert.equal(reads, 2);
});
