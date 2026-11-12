# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version of the Google Health integration, started from the official
  Gladys JavaScript integration template. It reads a Google Health account
  (Fitbit, Pixel Watch) through the Google Health API v4, over the cloud.
- Google account linked with OAuth 2.0 from the Configuration screen, with your
  own Google Cloud OAuth client. Read-only scopes only; the access token is
  renewed by itself.
- One **Google Health** device per account, with 18 features: steps, distance,
  active and total calories, floors, active zone minutes, heart rate, resting
  heart rate, sleep (duration, deep, REM, light, awake), weight, body fat,
  oxygen saturation, heart rate variability and respiratory rate.
- Dashboard widgets: **Health of the day** (steps against the goal, heart rate,
  sleep, calories, distance, weight, with a Refresh button) and **Health over
  7 days** (bar chart of one metric, average and best day).
- Scene triggers: daily step goal reached, a night of sleep recorded (goal
  reached or missed), a weigh-in recorded (higher, lower, stable), a workout
  recorded.
- Scene actions: read Google Health now, and get the health summary of the day
  (figures and a ready-made sentence in English, French, German or Spanish).
- Configuration actions: test the connection, disconnect the Google account
  (the access is also revoked at Google).
- Daily step and sleep goals, refresh interval and time zone settings.
- Every text in English, French, German and Spanish: manifest, messages,
  widgets and the user documentation (`docs/`).
- `SECURITY.md`, `CLAUDE.md`, and the CI, Release, build and GitHub Release
  workflows.

[Unreleased]: https://github.com/prohand/google-health/commits/main
