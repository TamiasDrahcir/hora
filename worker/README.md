# HORA alert worker

A small Cloudflare Worker that delivers HORA's reminders while HORA is closed. The app syncs its
upcoming reminders here; a cron trigger sends the due ones every minute through either or both of:

- **Browser push** (Web Push): shows up as a normal browser notification.
- **Discord webhook**: a message in a Discord channel you control, which reaches your phone and
  desktop through the Discord apps. It needs no browser support, so it works even when a browser
  profile can't use push.

```
HORA (browser) --POST /sync--> Worker (D1 database) --cron every minute--> browser push service --> your browser
                                                                     \--> Discord webhook --> Discord apps
```

Free-plan Cloudflare is enough (Workers, D1, one cron trigger).

## One-time setup

Run these from this `worker/` folder.

```powershell
npm install

# 1. Sign in (opens your browser)
npx wrangler login

# 2. Create the database, then paste the database_id it prints into wrangler.toml
npx wrangler d1 create hora-push
npm run db:init

# 3. Generate the VAPID keypair
npm run keys
#    - put the PUBLIC key into wrangler.toml (VAPID_PUBLIC_KEY) and ../.env.production (VITE_VAPID_PUBLIC_KEY)
#    - give the PRIVATE key to Cloudflare only (paste it when prompted), never commit it:
npx wrangler secret put VAPID_PRIVATE_KEY

# 4. Deploy and note the URL it prints (https://hora-push.<you>.workers.dev)
npm run deploy
```

Then, from the repository root, put that URL into `.env.production` as `VITE_PUSH_API_URL`, and publish the site:

```powershell
npm run deploy
```

Open HORA, turn on **Notifications**, and allow the browser prompt. The switch shows
"Background alerts on" once the first sync succeeds.

Note: Cloudflare can take up to ~10 minutes after the first deploy before the every-minute cron
starts running, so background alerts may not arrive right away. You can watch it start with
`npx wrangler tail hora-push` (a line like `"* * * * *" ... - Ok` appears every minute).

## Discord alerts

1. In Discord, use a server you control (a private one of your own is ideal).
   Server Settings > Integrations > Webhooks > New Webhook > pick a channel > **Copy Webhook URL**.
2. Set that channel's notifications to **All Messages** (otherwise Discord only pings on @mentions).
3. In HORA, click **Discord** next to the Notifications switch, paste the URL, and press
   **Save and send test**. A test message appears in the channel; HORA only keeps a webhook that
   Discord accepted.

The webhook URL contains a secret token. It is stored in the browser's local storage and in the
worker's database, never logged, and only ever sent to Discord. Alert text goes through Discord's
servers. Task names can't ping anyone (`@everyone` and role mentions are disabled).

## Upgrading an existing deployment

The first version of this worker only supported browser push. To move an existing database to the
current schema (this drops the old rows; the app rebuilds them on its next sync):

```powershell
npx wrangler d1 execute hora-push --remote --file=./migrations/0002_clients.sql
npm run deploy
```

## How it behaves

- Alerts: 5 minutes before a block or event starts, and when a flexible block ends uncompleted.
- Every time your schedule changes, the app replaces its stored reminders, so completed, mothballed,
  abandoned and moved blocks never send stale alerts.
- The open app and the push service use the same notification tag, so a device never shows one alert twice.
  Discord is a separate channel, so with both on you will see the alert in each place.
- A reminder more than 30 minutes late is dropped instead of being sent. If Discord rate-limits a
  message it is retried on the next minute.
- Only requests from the origins in `ALLOWED_ORIGINS` are accepted, only real browser push services
  (Chrome/Edge, Firefox, Apple) are accepted as push endpoints, and only `discord.com` webhook URLs
  are accepted for Discord.

## Local testing

```powershell
# .dev.vars (git-ignored) with VAPID_PUBLIC_KEY=... and VAPID_PRIVATE_KEY=...
npm run db:init:local
npm run dev            # worker on http://localhost:8787, add /__scheduled to trigger the cron
```

For the app, put `VITE_PUSH_API_URL=http://localhost:8787` and `VITE_VAPID_PUBLIC_KEY=...` in
`.env.development.local`. Do not use `.env.local`: Vite also reads it for production builds.

## Changing keys

If you regenerate the VAPID keypair, update all three places (wrangler.toml, the Cloudflare secret,
`.env.production`) and redeploy both; browsers re-subscribe automatically the next time HORA opens.

## Privacy

The worker stores a random id for your browser, your browser's push endpoint and/or Discord webhook
URL, and the text of your upcoming alerts (task codes, names and times). Nothing else from HORA is
sent. Turning off both Notifications and Discord deletes your stored data.
