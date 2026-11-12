# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human
contributors working in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one
runtime dependency: `@gladysassistant/integration-sdk`) that reads a **Google
Health** account (Fitbit, Pixel Watch) through the Google Health API v4
(`https://health.googleapis.com/v4`) and exposes it in Gladys: one device with
18 health features, two dashboard widgets, four scene triggers and two scene
actions. Requires Gladys 5.3+. It started from the official JavaScript
template; the workflows are those of `prohand/gladys-devmel`.

It is a **cloud** integration (`"transports": ["cloud"]`): Google has no local
API. The user brings their own Google Cloud OAuth client (client ID + secret)
and links the account with the `oauth2` field of the Configuration screen.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/snapshot.test.js           # one file
node --test --test-name-pattern "goal"      # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store admission checks
```

CI runs `format:check`, `lint` and `test` on Node 22 and 24; pull requests also
run the store checks and build the image. Run the three commands before pushing.
Releases: **Actions → Release** only (bumps `package.json`, the manifest
`version` + `docker_image`, rolls the changelog, tags, builds the image).

## Architecture

```
index.js                 bootstrap only: SDK client, createApp, connect
src/app.js               the application: handlers, token storage, read timer, status
src/config.js            defaults (mirror the manifest) + normalization, token keys
src/i18n.js              LANGUAGES (en, fr, de, es), pick, localize
src/messages.js          user-facing sentences in the four languages
src/google/oauth.js      OAuth 2.0: consent URL, code exchange, refresh, revoke
src/google/client.js     Google Health API client (fetch, 401 -> refresh once)
src/google/dataTypes.js  scopes + the metrics read (daily roll-ups, latest points)
src/health/snapshot.js   one read of the API -> { values, daily, sleep, weight, workout }
src/health/memory.js     what was already announced, persisted in /data/memory.json
src/health/time.js       civil dates in the user's time zone
src/devices/index.js     the account device, its 18 features, states, transport badge
src/scenes.js            scene triggers (detectEvents) and scene actions
src/widgets.js           dashboard widgets (daily_summary, weekly_trend)
test/                    node --test; helpers/fakeGoogle.js fakes Google
```

### Invariants worth knowing

- **Keys are forever.** Feature keys (`src/devices/index.js`), scene trigger,
  scene action, widget and setting keys, and `config_schema` keys are stored by
  users: add, never rename. The device external id is built from the
  `healthUserId` Google returns (`gladys.externalIds('account', id)`).
- **Read-only.** Only `*.readonly` Google scopes are requested
  (`OAUTH_SCOPES`). Never add a write scope.
- **Secrets.** The client secret, the access token, the refresh token and the
  authorization code are never logged and never put in a URL
  (`test/app.test.js` checks the logs). Tokens are stored with
  `gladys.setConfig` under keys outside the manifest (`TOKEN_KEYS`).
- **The integration polls on its own timer**, not through `onPoll`: the
  widgets and the scene triggers need the data even when the user has not
  created the device. The interval is `poll_frequency` (seconds, 300 minimum).
- **States are only published for created features** (`buildStates` reads
  `gladys.devices`), through `publishChangedStates`.
- **One event per fact.** `detectEvents` compares a snapshot with the memory;
  the first read after an empty memory records without firing. The memory is
  the only thing written to disk, under `/data` (the rootfs is read-only).
- **A missing metric is not a failure.** A data type Google refuses (scope not
  granted, no data) is left out of the snapshot; the read only throws when
  nothing answers. A day without a roll-up point counts zero.
- **"Today" is the user's day**: the `timezone` setting, else the container's.
- **API shapes**: data types are kebab-case in the URL, snake_case in filters,
  camelCase in JSON; 64-bit integers arrive as strings; filters only accept
  `>=`, `<` and `AND`; daily roll-up ranges are civil dates, closed-open, with
  integer month and day. Google webhooks need a service account and a project
  subscriber: they are not used.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with
the code (defaults, action / scene / widget handlers, trigger options) and with
the store rules (field types, four languages everywhere, description length,
`keywords`, `gladys_version >=5.3.0`). Change both sides together. Never edit
`version` or the `docker_image` tag by hand.

## Testing

No network: `test/helpers/fakeGoogle.js` answers the token endpoint and the
Health API; the fake Gladys of the SDK (`createFakeGladys`) plays Gladys and
refuses what the host API refuses. `createApp` takes `fetch`, `now`,
`memoryStore`, `setTimer` and `clearTimer` as options for that purpose.

## Conventions

- Prettier formats, ESLint catches mistakes. Comments explain **why**, in
  English.
- User-facing text is `{ en, fr, de, es }`: manifest, messages, widget texts,
  and `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
- Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md`. Never write a version heading: the Release workflow does.
