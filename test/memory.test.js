import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EMPTY_MEMORY, createMemoryStore } from '../src/health/memory.js';

test('the memory survives a restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'google-health-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createMemoryStore(directory);
  assert.deepEqual(await store.load(), { ...EMPTY_MEMORY });
  await store.save({ ...EMPTY_MEMORY, initialized: true, sleepId: 's1' });
  assert.equal((await createMemoryStore(directory).load()).sleepId, 's1');
});

test('an unreadable or unwritable memory never throws', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'google-health-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'memory.json'), '{ not json');
  assert.deepEqual(await createMemoryStore(directory).load(), { ...EMPTY_MEMORY });
  // A file where the directory should be: nothing can be written there.
  const blocked = createMemoryStore(join(directory, 'memory.json', 'nested'));
  await blocked.save({ ...EMPTY_MEMORY });
  assert.deepEqual(await blocked.load(), { ...EMPTY_MEMORY });
});
