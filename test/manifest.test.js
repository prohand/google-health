// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest, but it cannot know which handlers
// the code registers: these tests keep both sides in sync, and catch the store
// rules that are the easiest to miss.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { OAUTH_FIELD, createApp } from '../src/app.js';
import { DEFAULT_CONFIG, TOKEN_KEYS } from '../src/config.js';
import { DAILY_METRIC_KEYS } from '../src/google/dataTypes.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS, SLEEP_QUALITIES, WEIGHT_TRENDS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';

const read = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('../gladys-assistant-integration.json'));
const pkg = JSON.parse(await read('../package.json'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list, key) => list.find((entry) => entry.key === key);

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
    (item) => item.fields ?? [],
  ),
  ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
];

// The store schema is the admission authority: a field type outside this list
// gets the integration rejected by the indexer.
const FIELD_TYPES = [
  'string',
  'number',
  'boolean',
  'select',
  'multi_select',
  'secret',
  'oauth2',
  'section',
];

// The shelves of the store catalog.
const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
];

/** Every multi-language object found in a JSON tree, with its path. */
function* texts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) yield* texts(item, `${path}[${index}]`);
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      yield [path, node];
    } else {
      for (const [key, value] of Object.entries(node)) yield* texts(value, `${path}.${key}`);
    }
  }
}

test('every text of the manifest is written in English, French, German and Spanish', () => {
  let count = 0;
  for (const [path, text] of texts(manifest)) {
    count += 1;
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), path);
    for (const [language, value] of Object.entries(text)) {
      assert.ok(value.trim().length > 0, `${path}.${language} is empty`);
    }
  }
  assert.ok(count > 50, 'the manifest holds texts');
});

test('labels, descriptions and placeholders are multi-language objects, never strings', () => {
  const visit = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
    } else if (node && typeof node === 'object') {
      for (const key of ['label', 'description', 'placeholder']) {
        if (node[key] !== undefined) {
          assert.equal(typeof node[key], 'object', `${path}.${key} must be an object`);
          assert.ok(node[key].en, `${path}.${key} needs an English text`);
        }
      }
      for (const [key, value] of Object.entries(node)) visit(value, `${path}.${key}`);
    }
  };
  visit(manifest, 'manifest');
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/google-health:${manifest.version}`);
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/prohand\/google-health\//,
  );
});

test('the integration is a cloud one: Google has no local API', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.type, 'device');
});

test('the Gladys floor covers every field the manifest declares', () => {
  // Older cores reject a manifest field they do not know: `categories` needs
  // 4.86, the widgets and scene declarations 5.1, `keywords` 5.3.
  const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
  assert.match(manifest.gladys_version, /^>=\d+\.\d+\.\d+$/);
  assert.ok(major > 5 || (major === 5 && minor >= 3), `got ${manifest.gladys_version}`);
});

test('categories and keywords follow the store rules', () => {
  const { categories, keywords } = manifest;
  assert.ok(categories.length >= 1 && categories.length <= 3);
  assert.equal(new Set(categories).size, categories.length);
  for (const category of categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
  assert.ok(keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('every field uses a type the store accepts and a snake_case key', () => {
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/, `field key "${field.key}"`);
    if (field.placeholder !== undefined) {
      assert.ok(
        ['string', 'number', 'secret'].includes(field.type),
        `field "${field.key}": a ${field.type} field cannot have a placeholder`,
      );
    }
    if (field.type === 'select' || field.type === 'multi_select') {
      assert.ok(field.options?.length > 0, `field "${field.key}" needs options`);
    }
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((field) => field.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    for (const key of ['required', 'default', 'placeholder']) {
      assert.equal(section[key], undefined, `section "${section.key}" must not have ${key}`);
    }
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('config_schema and DEFAULT_CONFIG describe the same keys and defaults', () => {
  const fields = manifest.config_schema.filter(
    (field) => field.type !== 'section' && field.type !== 'oauth2',
  );
  assert.deepEqual(keysOf(fields).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of fields) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
    }
  }
});

test('the client secret is a secret field, and the tokens are not in the schema', () => {
  assert.equal(byKey(manifest.config_schema, 'client_secret').type, 'secret');
  const oauthFields = manifest.config_schema.filter((field) => field.type === 'oauth2');
  assert.deepEqual(keysOf(oauthFields), [OAUTH_FIELD]);
  for (const key of TOKEN_KEYS) {
    assert.equal(byKey(manifest.config_schema, key), undefined, `"${key}" must stay internal`);
  }
});

test('every manifest action has a handler, and vice versa', () => {
  const app = createApp(createFakeGladys(), { memoryStore: { load: async () => ({}) } });
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(app.actions).sort());
});

test('every scene action has a handler, and its outputs are declared', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  for (const action of manifest.scene_actions) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    for (const output of action.outputs) {
      assert.ok(['string', 'number', 'boolean'].includes(output.type), output.key);
    }
  }
});

test('the scene triggers the code fires are the ones the manifest declares', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
  const optionsOf = (trigger, field) =>
    byKey(byKey(manifest.scene_triggers, trigger).fields, field)
      .options.map((option) => option.value)
      .sort();
  assert.deepEqual(
    optionsOf(SCENE_TRIGGERS.SLEEP_RECORDED, 'quality'),
    Object.values(SLEEP_QUALITIES).sort(),
  );
  assert.deepEqual(
    optionsOf(SCENE_TRIGGERS.WEIGHT_RECORDED, 'trend'),
    Object.values(WEIGHT_TRENDS).sort(),
  );
});

test('a trigger filter is also a variable, so the event data carries it', () => {
  for (const trigger of manifest.scene_triggers) {
    const variables = keysOf(trigger.variables);
    for (const field of trigger.fields ?? []) {
      assert.ok(variables.includes(field.key), `${trigger.key}.${field.key}`);
    }
  }
});

test('every widget has a handler, and the trend setting lists the daily metrics', () => {
  assert.ok(manifest.widgets.length <= 5);
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const widget of manifest.widgets) {
    assert.equal(typeof WIDGETS[widget.key].get, 'function');
    assert.equal(typeof WIDGETS[widget.key].action, 'function');
  }
  const metric = byKey(byKey(manifest.widgets, 'weekly_trend').settings, 'metric');
  assert.deepEqual(
    metric.options.map((option) => option.value),
    DAILY_METRIC_KEYS,
  );
  assert.equal(metric.default, 'steps');
});

test('the user documentation exists in every language', async () => {
  for (const language of LANGUAGES) {
    const doc = await read(`../docs/${language}.md`);
    assert.match(doc, /^# Google Health/, `docs/${language}.md`);
    assert.ok(doc.length > 2000, `docs/${language}.md is too short`);
  }
});

test('the Docker image copies everything the manifest and the code need', async () => {
  const dockerfile = await read('../Dockerfile');
  for (const path of ['index.js', 'src', 'gladys-assistant-integration.json']) {
    assert.match(dockerfile, new RegExp(`COPY ${path.replace('.', '\\.')} `), path);
  }
  assert.match(dockerfile, /^USER node$/m, 'the image runs unprivileged');
});
