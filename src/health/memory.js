// -----------------------------------------------------------------------------
// What the integration remembers between two reads, and across restarts: the
// last sleep, weigh-in and workout it announced, and the day the step goal was
// reached. Without it a restart would fire every scene trigger again.
//
// Stored in /data, the only writable path of the container. A missing or
// unreadable file is not an error: the integration starts from an empty
// memory, and the first read then records what it sees without firing.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'memory' });

export const EMPTY_MEMORY = Object.freeze({
  initialized: false,
  stepsGoalDay: null,
  sleepId: null,
  weightId: null,
  weightKilograms: null,
  workoutId: null,
});

/**
 * @param {string} [directory] writable directory (`/data` in the container)
 */
export function createMemoryStore(directory = process.env.GOOGLE_HEALTH_DATA_DIR || '/data') {
  const file = join(directory, 'memory.json');
  return {
    async load() {
      try {
        return { ...EMPTY_MEMORY, ...JSON.parse(await readFile(file, 'utf8')) };
      } catch (err) {
        if (err.code !== 'ENOENT')
          logger.warn(`Memory file unreadable, starting empty: ${err.message}`);
        return { ...EMPTY_MEMORY };
      }
    },
    async save(memory) {
      try {
        await mkdir(dirname(file), { recursive: true });
        // Write then rename: a container stopped mid-write leaves the old file.
        await writeFile(`${file}.tmp`, JSON.stringify(memory));
        await rename(`${file}.tmp`, file);
      } catch (err) {
        logger.warn(
          `Memory not saved (scene triggers may fire again after a restart): ${err.message}`,
        );
      }
    },
  };
}
