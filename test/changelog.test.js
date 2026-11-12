// The Release workflow rolls CHANGELOG.md with this script: a mistake there
// only shows on release day, so it is checked against the real file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

test('the changelog keeps an Unreleased section for the Release workflow', () => {
  assert.match(changelog, /^## \[Unreleased\][ \t]*$/m);
  assert.match(changelog, /^\[Unreleased\]: https:\/\/github\.com\/prohand\/google-health\//m);
});

test('a release moves the Unreleased changes under the version', () => {
  const text = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- A thing.',
    '',
    '[Unreleased]: https://github.com/prohand/google-health/commits/main',
    '',
  ].join('\n');
  const rolled = rollChangelog(text, '1.1.0', '2026-03-04');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-03-04\n\n### Added\n\n- A thing\./,
  );
  assert.match(rolled, /^\[Unreleased\]: .*\/compare\/v1\.1\.0\.\.\.HEAD$/m);
  assert.match(rolled, /^\[1\.1\.0\]: .*\/releases\/tag\/v1\.1\.0$/m);
  // Rolling the same version twice changes nothing.
  assert.equal(rollChangelog(rolled, '1.1.0', '2026-03-05'), rolled);
});

test('the real changelog rolls without losing a line', () => {
  const rolled = rollChangelog(changelog, '9.9.9', '2026-03-04');
  assert.match(rolled, /^## \[9\.9\.9\] - 2026-03-04$/m);
  for (const line of changelog.split('\n').filter((l) => l.startsWith('- '))) {
    assert.ok(rolled.includes(line), line);
  }
});
