# Google Health

This integration brings your **Google Health** data into Gladys: what your
Fitbit tracker or scale, or your Pixel Watch, sends to your Google account.
Steps, heart rate, sleep, weight and more become sensors, dashboard widgets and
scene triggers.

Access is **read-only**: Gladys can never change anything in your account.

## Before you start

You need:

- **Gladys 5.3 or later**;
- a Google account that uses the **Fitbit** app (that is where the Google
  Health profile lives);
- a free **Google Cloud** project. Google only gives health data to an
  application that belongs to you, so you create your own "application" once.
  It takes about ten minutes.

The integration talks to Google over the Internet (cloud): there is no local
mode.

## Step 1 — Create your Google application

1. Open the [Google Cloud console](https://console.cloud.google.com/) and
   create a project (any name, for instance `Gladys`).
2. Open **APIs & Services → Library**, search for **Google Health API** and
   press **Enable**.
3. Open **APIs & Services → OAuth consent screen**:
   - user type **External**;
   - fill the application name and your e-mail address;
   - on **Data access**, add the three scopes ending with
     `googlehealth.activity_and_fitness.readonly`,
     `googlehealth.health_metrics_and_measurements.readonly` and
     `googlehealth.sleep.readonly`;
   - on **Audience**, add your own Google address as a **test user**.
4. Open **APIs & Services → Credentials → Create credentials → OAuth client
   ID**, type **Web application**.
5. Copy the **client ID** and the **client secret**.

### The redirect URI

Google only sends you back to an address you declared. In the OAuth client,
under **Authorized redirect URIs**, add the address Gladys uses.

The simplest way to get it: do step 2 once. If Google answers
`redirect_uri_mismatch`, either copy the address shown in the error details, or
press **Test the connection** in Gladys: the address is shown under the button.
Add it to the OAuth client, wait a minute, and connect again.

Google only accepts an `https://` address with a domain name, or
`http://localhost`. Open Gladys through such an address when you connect (your
Gladys Plus address works).

## Step 2 — Configure the integration

1. Open the **Configuration** tab of the integration.
2. Paste the **OAuth client ID** and the **OAuth client secret**, then **save**.
3. Press **Connect** next to **Google account**, choose your account and tick
   **every** permission. A permission left unticked leaves its sensors empty.
4. Back in Gladys, the status turns to connected. Open the **Discovery** tab
   and add the **Google Health** device.

Other settings:

- **Daily step goal** and **Sleep goal**: used by the widget gauge and by the
  scene triggers.
- **Refresh interval**: how often Google is read (15 minutes by default, 5
  minutes at most). Your watch itself only syncs with your phone from time to
  time, so a shorter interval rarely brings fresher data.
- **Time zone**: for instance `Europe/Paris`. It decides when "today" starts.
  Leave it empty and the day follows UTC.

## What you get

### The device

One **Google Health** device with these sensors:

| Sensor                                  | Unit    |
| --------------------------------------- | ------- |
| Steps today                             | steps   |
| Distance today                          | km      |
| Active calories, total calories today   | kcal    |
| Floors today                            | floors  |
| Active zone minutes today               | minutes |
| Heart rate, resting heart rate          | bpm     |
| Sleep duration, deep, REM, light, awake | minutes |
| Weight                                  | kg      |
| Body fat, oxygen saturation (SpO2)      | %       |
| Heart rate variability                  | ms      |
| Respiratory rate                        | per min |

A sensor stays empty when your devices do not measure it. "Today" counters go
back to zero at midnight in your time zone.

### Dashboard widgets

- **Health of the day**: steps against your goal, heart rate, last sleep,
  calories, distance and weight, with a **Refresh** button.
- **Health over 7 days**: a bar chart of the last seven days of the metric you
  choose (steps, distance, calories, floors, active zone minutes), with the
  daily average and the best day.

### Scenes

Triggers, under the **Integrations** category of the scene editor:

- **Daily step goal reached** — once a day. Variables: steps, goal.
- **A night of sleep is recorded** — filter: goal reached or missed.
  Variables: time asleep (minutes and hours), deep and REM sleep.
- **A weigh-in is recorded** — filter: higher, lower or stable. Variables:
  weight, change since the previous weigh-in.
- **A workout is recorded** — variables: name, type, duration, calories,
  distance.

Actions:

- **Read Google Health now** — reads the account without waiting.
- **Get the health summary of the day** — returns the figures and a ready-made
  sentence (in the language you choose) to send as a message or to speak, for
  instance: "Today: 8,200 steps (goal 10,000), 6.1 km, 2,150 kcal."

A trigger fires when Google **receives** the data, that is after your watch
has synced, and at the next read of the integration.

## Buttons of the Configuration screen

- **Test the connection** — reads the account now and says what was found.
- **Disconnect the Google account** — forgets the account and revokes the
  access at Google. The device and its history stay in Gladys.

## Troubleshooting

- **`redirect_uri_mismatch`** — see "The redirect URI" above.
- **"Access blocked" or error 403 `access_denied` at Google** — your address is
  not in the **test users** of the consent screen.
- **The connection is lost every 7 days** — Google expires the access of an
  application left in **Testing**. On the consent screen, **publish** the
  application (for your own use, no verification is needed below 100 users;
  Google shows an "unverified app" warning you can pass).
- **"This Google account has no Google Health (Fitbit) profile"** — open the
  Fitbit app once with this Google account.
- **Some sensors stay empty** — a permission was not ticked: disconnect, then
  connect again and tick everything. Or your devices do not measure it.
- **Values look late** — open the Fitbit app on your phone to force a sync of
  your watch.

## Privacy

Your health data goes from Google to your Gladys, and nowhere else. The
integration only contacts `accounts.google.com`, `oauth2.googleapis.com` and
`health.googleapis.com`. You can revoke the access at any time from your
[Google account](https://myaccount.google.com/connections).
