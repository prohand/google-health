# Google Health — Gladys Assistant integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
brings your **Google Health** data (Fitbit trackers and scales, Pixel Watch)
into Gladys: steps, heart rate, sleep, weight and more, as device features,
dashboard widgets, scene triggers and scene actions.

It was started from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and uses the
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

> Not affiliated with Google. "Google Health", "Fitbit" and "Pixel Watch" are
> trademarks of Google LLC.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## What it does

| Surface        | Content                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Device         | One **Google Health** device per account, 18 read-only features: steps, distance, active/total calories, floors, active zone minutes, heart rate, resting heart rate, sleep (5), weight, body fat, SpO2, HRV, respiratory rate |
| Widgets        | **Health of the day** (`daily_summary`) and **Health over 7 days** (`weekly_trend`)                                                                                                                                            |
| Scene triggers | `steps_goal_reached`, `sleep_recorded`, `weight_recorded`, `workout_recorded`                                                                                                                                                  |
| Scene actions  | `sync_now`, `get_daily_summary`                                                                                                                                                                                                |
| Config actions | `test_connection`, `disconnect`                                                                                                                                                                                                |
| Languages      | English, French, German, Spanish                                                                                                                                                                                               |
| Transport      | **Cloud** (`"transports": ["cloud"]`): the Google Health API has no local equivalent                                                                                                                                           |
| Gladys         | 5.3.0 or later                                                                                                                                                                                                                 |

## How it talks to Google

- **API**: Google Health API v4, `https://health.googleapis.com/v4`, read with
  the built-in `fetch`.
- **Authorization**: OAuth 2.0 authorization code flow, relayed by Gladys (the
  `oauth2` field of the manifest). You create the OAuth client in your own
  Google Cloud project: Google only gives health data to an application you
  own. Only **read-only** scopes are requested:
  `googlehealth.activity_and_fitness.readonly`,
  `googlehealth.health_metrics_and_measurements.readonly` and
  `googlehealth.sleep.readonly`.
- **Reads**: every `poll_frequency` seconds (15 minutes by default), about 15
  requests: one daily roll-up over 7 days per activity metric, and the latest
  data point of the others. A metric Google refuses is skipped, not fatal.
- **No webhook**: Google's webhooks need a service account and a project-level
  subscriber, too much to ask of a home user. The integration polls.
- **Tokens** are stored in the Gladys configuration of the integration, under
  keys the form never shows. Nothing secret is logged.

## Project structure

```
.
├─ index.js                          # bootstrap: SDK client, app, connect
├─ src/
│  ├─ app.js                         # handlers, tokens, read timer, status
│  ├─ config.js                      # defaults + normalization
│  ├─ i18n.js, messages.js           # the four languages
│  ├─ google/                        # oauth.js, client.js, dataTypes.js
│  ├─ health/                        # snapshot.js, memory.js, time.js
│  ├─ devices/index.js               # the account device and its features
│  ├─ scenes.js                      # scene triggers and actions
│  └─ widgets.js                     # dashboard widgets
├─ docs/                             # user documentation: en, fr, de, es
├─ test/                             # node --test, no network
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, Release, build, GitHub Release, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="google-health" \
GOOGLE_HEALTH_DATA_DIR="./data" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs in its container. `GOOGLE_HEALTH_DATA_DIR` is where the
integration keeps its small memory file (`/data` in the container).

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test, against a fake Gladys and a fake Google
```

The CI runs them on Node 22 and 24. Pull requests also run the store admission
checks and build the Docker image.

## Release

Describe your changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then open **Actions → Release → Run workflow** and pick `patch`, `minor` or
`major`. The workflow bumps the version everywhere, rolls the changelog, pushes
the `vX.Y.Z` tag, publishes the multi-arch image to `ghcr.io` and creates the
GitHub Release. Never edit a version by hand.

For the store to list the integration, the repository needs the GitHub topic
`gladys-assistant-integration`.

## Security

See [`SECURITY.md`](SECURITY.md) to report a vulnerability privately.

## License

Apache-2.0
