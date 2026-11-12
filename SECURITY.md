# Security policy

## Supported versions

Only the latest release of the Google Health integration receives security
fixes. Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue, pull request or forum post for a
security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/google-health](https://github.com/prohand/google-health/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, client secrets and e-mail addresses
  first).

You should get a first answer within 7 days. A fix is released as a new version
of the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)),
and Google's services and APIs this integration talks to.

## How the integration handles your data

- It only asks Google for **read-only** scopes: it can never write, change or
  delete anything in your Google account.
- The OAuth client secret, the access token and the refresh token are stored in
  the Gladys configuration of the integration, never in the image, never in the
  logs.
- Health data goes from Google to your Gladys, and nowhere else: the
  integration talks to `accounts.google.com`, `oauth2.googleapis.com` and
  `health.googleapis.com` only.

## Good practices for users

- Create a Google Cloud OAuth client dedicated to Gladys, and keep its secret
  only in the integration's secret field.
- Revoke the access from your
  [Google account](https://myaccount.google.com/connections) when you stop using
  the integration.
- Keep Gladys and the integration up to date.
