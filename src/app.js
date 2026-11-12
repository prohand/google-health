// -----------------------------------------------------------------------------
// The application: everything between the SDK and the Google Health API.
//
// `createApp(gladys)` registers the handlers (before `connect()`) and owns the
// state: the configuration, the last snapshot read, the connection status and
// the read timer. It takes its HTTP client, clock, timer and storage as
// options, so the tests run it against a fake Gladys with no network.
//
// The life of a read (`sync`):
//   1. get a valid access token (refreshed when needed, stored in the config);
//   2. read the account (src/health/snapshot.js);
//   3. publish the states of the features the user created;
//   4. fire the scene triggers for what is new (src/scenes.js);
//   5. report the connection status, the transport badge, nudge the widgets.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  NO_TOKENS,
  TOKEN_KEYS,
  USER_KEYS,
  hasClient,
  isLinked,
  normalizeConfig,
} from './config.js';
import { buildDiscoveredDevices, buildStates, buildTransports } from './devices/index.js';
import { createHealthClient } from './google/client.js';
import { ReauthorizationRequiredError, createOAuth } from './google/oauth.js';
import { createMemoryStore } from './health/memory.js';
import { fetchSnapshot } from './health/snapshot.js';
import { MESSAGES, errorMessage, notLinkedHelp, syncReport } from './messages.js';
import { SCENE_ACTIONS, detectEvents } from './scenes.js';
import { WIDGETS, refreshWidgets } from './widgets.js';

const logger = createLogger({ name: 'google-health' });

// Key of the `oauth2` field of the manifest.
export const OAUTH_FIELD = 'google_account';

// An unchanged value is sent again after this long, so the history shows the
// feature is alive.
const STATE_HEARTBEAT_MS = 6 * 60 * 60 * 1000;

export const STATUS = {
  MISSING_CLIENT: 'missing_client',
  NOT_LINKED: 'not_linked',
  OK: 'ok',
  ERROR: 'error',
};

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] HTTP client
 * @param {() => number} [options.now] clock, in milliseconds
 * @param {{ load: Function, save: Function }} [options.memoryStore]
 * @param {typeof setTimeout} [options.setTimer]
 * @param {typeof clearTimeout} [options.clearTimer]
 */
export function createApp(gladys, options = {}) {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetch ?? fetch;
  const memoryStore = options.memoryStore ?? createMemoryStore();
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;

  const oauth = createOAuth({ fetch: fetchImpl, now });

  let config = normalizeConfig();
  let snapshot = null;
  let status = { state: STATUS.MISSING_CLIENT, message: MESSAGES.missingClient };
  let memory = null;
  let timer = null;
  let running = null;
  let stopped = false;
  // The redirect URI Gladys last gave: the one to declare at Google.
  let redirectUriSeen = '';

  // --- Tokens ----------------------------------------------------------------

  async function storeConfig(values) {
    config = { ...config, ...values };
    await gladys.setConfig(values);
  }

  async function getAccessToken(force = false) {
    if (!isLinked(config)) {
      throw new ReauthorizationRequiredError('No Google account linked');
    }
    if (!force && oauth.isFresh(config)) {
      return config.access_token;
    }
    logger.debug('Refreshing the Google access token');
    await storeConfig(await oauth.refresh(config));
    return config.access_token;
  }

  const client = createHealthClient({ getAccessToken, fetch: fetchImpl });

  // --- What Gladys is told ---------------------------------------------------

  /** Best effort: a refused side call must never fail a read. */
  async function quietly(label, call) {
    try {
      await call();
    } catch (err) {
      logger.warn(`${label} failed: ${err.message}`);
    }
  }

  async function setStatus(state, message) {
    status = { state, message };
    const connected = state === STATUS.OK;
    await quietly('setConnectionStatus', () =>
      connected ? gladys.setConnectionStatus(true) : gladys.setConnectionStatus(false, message),
    );
    const transports = buildTransports(gladys, config.health_user_id, connected);
    if (transports.length > 0) {
      await quietly('publishTransports', () => gladys.publishTransports(transports));
    }
    refreshWidgets(gladys);
  }

  function idleStatus() {
    return hasClient(config)
      ? setStatus(STATUS.NOT_LINKED, MESSAGES.notLinked)
      : setStatus(STATUS.MISSING_CLIENT, MESSAGES.missingClient);
  }

  function publishDevices() {
    return gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config.health_user_id));
  }

  async function publishStates() {
    if (!snapshot || !config.health_user_id) return;
    const states = buildStates(gladys, config.health_user_id, snapshot.values);
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
  }

  async function fireSceneEvents() {
    memory ??= await memoryStore.load();
    const detected = detectEvents(memory, snapshot, config);
    for (const event of detected.events) {
      logger.info(`Scene trigger ${event.key}`);
      await quietly(`publishSceneEvent(${event.key})`, () =>
        gladys.publishSceneEvent(event.key, event.data),
      );
    }
    if (JSON.stringify(detected.memory) !== JSON.stringify(memory)) {
      memory = detected.memory;
      await memoryStore.save(memory);
    }
  }

  // --- Reading the account ---------------------------------------------------

  async function readAccount() {
    if (!config.health_user_id) {
      // Also the cheapest way to know the account has a Google Health profile.
      const identity = await client.getIdentity();
      const healthUserId = identity.healthUserId ?? identity.legacyUserId;
      if (!healthUserId) throw new Error('Google sent no user identifier');
      await storeConfig({ health_user_id: String(healthUserId) });
      await quietly('publishDiscoveredDevices', publishDevices);
    }
    snapshot = await fetchSnapshot(client, { timeZone: config.timezone, now: now() });
    for (const { metric, message } of snapshot.errors) {
      logger.debug(`Metric ${metric} not read: ${message}`);
    }
    logger.info(
      `Read ${Object.keys(snapshot.values).length} metrics (${snapshot.errors.length} unavailable)`,
    );
    await quietly('publishStates', publishStates);
    await quietly('scene triggers', fireSceneEvents);
    await setStatus(STATUS.OK);
    return snapshot;
  }

  /**
   * Read the account now. One read at a time: a caller arriving during a read
   * gets the result of that read. Rejects when the account cannot be read;
   * the status then says why.
   */
  function sync() {
    if (!running) {
      running = (async () => {
        if (!isLinked(config)) {
          await idleStatus();
          throw new ReauthorizationRequiredError('No Google account linked');
        }
        try {
          return await readAccount();
        } catch (err) {
          logger.error(`Read failed: ${err.message}`);
          await setStatus(STATUS.ERROR, errorMessage(err));
          throw err;
        }
      })().finally(() => {
        running = null;
        schedule();
      });
    }
    return running;
  }

  /** (Re)arm the read timer; no timer while no account is linked. */
  function schedule() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (stopped || !isLinked(config)) return;
    timer = setTimer(() => {
      timer = null;
      sync().catch(() => {}); // already logged and reported by sync()
    }, config.poll_frequency * 1000);
    timer?.unref?.();
  }

  // What the scene actions and the widgets see of the application.
  const health = {
    get config() {
      return config;
    },
    get snapshot() {
      return snapshot;
    },
    get status() {
      return status;
    },
    sync,
  };

  // --- Handlers --------------------------------------------------------------

  async function start() {
    stopped = false;
    config = normalizeConfig(await gladys.getConfig());
    memory ??= await memoryStore.load();
    await quietly('publishDiscoveredDevices', publishDevices);
    if (isLinked(config)) {
      await sync().catch(() => {});
    } else {
      await idleStatus();
    }
  }

  async function onConfigUpdated(raw = {}) {
    // The tokens are written by the integration: a payload without them must
    // not unlink the account.
    const merged = { ...raw };
    for (const key of TOKEN_KEYS) {
      if (merged[key] === undefined) merged[key] = config[key];
    }
    const previous = config;
    config = normalizeConfig(merged);
    if (USER_KEYS.every((key) => previous[key] === config[key])) {
      return; // our own token write coming back
    }
    logger.info('Configuration updated');
    const clientChanged =
      previous.client_id !== config.client_id || previous.client_secret !== config.client_secret;
    if (clientChanged && previous.refresh_token !== '') {
      // A refresh token belongs to the OAuth client that obtained it.
      logger.info('The OAuth client changed: the Google account must be linked again');
      snapshot = null;
      await storeConfig(NO_TOKENS);
      await quietly('publishDiscoveredDevices', publishDevices);
    }
    if (isLinked(config)) {
      await sync().catch(() => {});
    } else {
      schedule();
      await idleStatus();
    }
  }

  async function onOAuthAuthorizeUrl(_key, redirectUri) {
    // The user may have just typed the client: read what Gladys stored.
    config = normalizeConfig({ ...config, ...(await gladys.getConfig()) });
    if (!hasClient(config)) {
      throw new Error(MESSAGES.missingClient.en);
    }
    redirectUriSeen = redirectUri ?? '';
    return oauth.buildAuthorizeUrl(config, redirectUri);
  }

  async function onOAuthCallback(_key, { code, state, redirectUri }) {
    if (!oauth.consumeState(state)) {
      throw new Error('Unknown or expired OAuth state: start the connection again.');
    }
    const tokens = await oauth.exchangeCode(config, code, redirectUri);
    // Another account may be linked this time: forget the previous identity.
    snapshot = null;
    await storeConfig({ ...tokens, health_user_id: '' });
    logger.info('Google account linked');
    await sync();
  }

  const actions = {
    async test_connection() {
      if (!hasClient(config)) return MESSAGES.missingClient;
      if (!isLinked(config)) return notLinkedHelp(redirectUriSeen);
      try {
        return syncReport(await sync());
      } catch (err) {
        return errorMessage(err);
      }
    },

    async disconnect() {
      if (!isLinked(config)) return MESSAGES.notLinked;
      const revoked = await oauth.revoke(config);
      snapshot = null;
      // The device stays in Gladys with its history; it is simply not fed.
      await storeConfig({ ...NO_TOKENS, health_user_id: config.health_user_id });
      schedule();
      await idleStatus();
      logger.info(`Google account unlinked (revoked at Google: ${revoked})`);
      return revoked
        ? {
            en: 'Google account disconnected, and the access revoked at Google.',
            fr: "Compte Google déconnecté, et l'accès révoqué chez Google.",
            de: 'Google-Konto getrennt und der Zugriff bei Google widerrufen.',
            es: 'Cuenta de Google desconectada y acceso revocado en Google.',
          }
        : {
            en: 'Google account disconnected here. Google could not be reached: also remove the access in your Google account.',
            fr: "Compte Google déconnecté ici. Google n'a pas pu être joint : retirez aussi l'accès dans votre compte Google.",
            de: 'Google-Konto hier getrennt. Google war nicht erreichbar: Entfernen Sie den Zugriff auch in Ihrem Google-Konto.',
            es: 'Cuenta de Google desconectada aquí. No se pudo contactar con Google: retire también el acceso en su cuenta de Google.',
          };
    },
  };

  return {
    health,
    sync,
    actions,

    /** Register every handler. Call it before `gladys.connect()`. */
    register() {
      gladys.onScanRequest(publishDevices);

      // A feature just created has no state yet: give it the last value read.
      gladys.onDeviceCreated(async () => {
        await quietly('getDevices', () => gladys.getDevices());
        gladys.forgetPublishedStates();
        await quietly('publishStates', publishStates);
      });

      gladys.onConfigUpdated(onConfigUpdated);
      gladys.onOAuthAuthorizeUrl(onOAuthAuthorizeUrl);
      gladys.onOAuthCallback(onOAuthCallback);

      for (const [key, handler] of Object.entries(actions)) {
        gladys.onAction(key, handler);
      }
      for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
        gladys.onSceneAction(key, (fields) => handler(gladys, { fields, health }));
      }
      for (const [key, widget] of Object.entries(WIDGETS)) {
        gladys.onWidgetGet(key, (request) => widget.get(gladys, { ...request, health }));
        gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
          widget.action(gladys, { actionKey, params, settings, health }),
        );
      }

      // After every (re)connection: the configuration may have changed while
      // the socket was down.
      gladys.on('connected', async () => {
        try {
          await start();
        } catch (err) {
          logger.error('Initialization failed', err);
          await setStatus(STATUS.ERROR, MESSAGES.unreachable);
        }
      });
    },

    /** Stop the read timer (shutdown). */
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
