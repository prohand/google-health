import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasClient, isLinked, normalizeConfig } from '../src/config.js';

test('an empty configuration gets the defaults', () => {
  const config = normalizeConfig();
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    assert.equal(config[key], value, key);
  }
  assert.equal(config.refresh_token, '');
  assert.equal(config.token_expires_at, 0);
});

test('numbers typed as strings are converted and kept inside their bounds', () => {
  const config = normalizeConfig({ poll_frequency: '10', steps_goal: '8000.4', sleep_goal: '99' });
  assert.equal(config.poll_frequency, 300);
  assert.equal(config.steps_goal, 8000);
  assert.equal(config.sleep_goal, 16);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 900);
  assert.equal(normalizeConfig({ steps_goal: null }).steps_goal, 10000);
});

test('the client and the linked account are told apart', () => {
  const client = { client_id: ' id ', client_secret: 'secret' };
  assert.equal(hasClient(normalizeConfig({ client_id: 'id' })), false);
  assert.equal(hasClient(normalizeConfig(client)), true);
  assert.equal(normalizeConfig(client).client_id, 'id');
  assert.equal(isLinked(normalizeConfig(client)), false);
  assert.equal(isLinked(normalizeConfig({ ...client, refresh_token: 'r' })), true);
  assert.equal(isLinked(normalizeConfig({ refresh_token: 'r' })), false);
});
