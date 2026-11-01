# HORA push worker

A small Cloudflare Worker that sends HORA's reminders as Web Push notifications, so they arrive
even when HORA is closed. The app syncs its upcoming reminders here; a cron trigger sends the due
ones every minute.

```
HORA (browser) --POST /sync--> Worker (D1 database) --cron every minute--> browser push service --> your browser
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

## How it behaves

- Alerts: 5 minutes before a block or event starts, and when a flexible block ends uncompleted.
- Every time your schedule changes, the app replaces its stored reminders, so completed, mothballed,
  abandoned and moved blocks never send stale alerts.
- The open app and the push service use the same notification tag, so a device never shows one alert twice.
- A reminder more than 30 minutes late is dropped instead of being sent.
- Only requests from the origins in `ALLOWED_ORIGINS` are accepted, and only real browser push services
  (Chrome/Edge, Firefox, Apple) are accepted as endpoints.

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

The worker stores your browser's push endpoint and the text of your upcoming alerts (task codes,
names and times). Nothing else from HORA is sent. Turning Notifications off deletes your stored data.
