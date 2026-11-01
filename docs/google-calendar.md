# Google Calendar and .ics export

The Execute page has a **Calendar** strip with two options.

## Export .ics (works everywhere, no setup)

Downloads `hora-week-YYYY-MM-DD.ics` containing this week's blocks and events, each with a 5-minute
reminder. In Google Calendar open **Settings > Import & export > Import**. Importing the same file
again updates the events instead of duplicating them. Mothballed and abandoned blocks are left out;
completed blocks appear with a check mark and no reminder.

## Sync to Google Calendar

Signs in with Google and keeps a calendar named **HORA** up to date. Every sync works in two steps:
first it **deletes every event HORA previously put on that calendar** from the start of the current
week onward, and only then adds the up-to-date events. Repeated syncs therefore replace the events
instead of piling up copies. If the deleting step fails, nothing is added.

- What is synced: the current week and any later week you have planned. Earlier weeks are left in
  Google Calendar as history and are not touched. Events you add to the HORA calendar yourself are never
  deleted; only events HORA created are.
- Every event has a 5-minute popup reminder, which Google delivers through its own apps (phone,
  desktop, email), so no browser push is needed. Mothballed and abandoned blocks are not sent.
- **Auto-sync** (the switch next to the Sync button, on by default): after your first manual sync, any
  change to the synced events (completing, mothballing, abandoning or moving a block, or planning a
  later week) is sent to Google automatically about two seconds after the change, on any page. Several
  quick changes are sent as one sync.
- The sign-in lasts about an hour and a browser cannot renew it silently. When it expires, auto-sync
  pauses and the Execute page says so; press **Sync** once to sign in again and it catches up.
- HORA asks only for `calendar.app.created`: it can create its own calendar and manage events **in
  that calendar only**. It cannot read or change your other calendars or events.
- HORA remembers its calendar in the browser. If you clear site data it finds the existing "HORA"
  calendar again by its description. If that ever fails and a second "HORA" calendar appears, delete
  the old one in Google Calendar.

### One-time setup (about 10 minutes)

HORA needs a Google OAuth client id. It is public (not a secret) and only identifies the app.

1. Open <https://console.cloud.google.com/> and create a project (for example "HORA").
2. **APIs & Services > Library**, search for **Google Calendar API**, and click **Enable**.
3. **APIs & Services > OAuth consent screen** (Google Auth Platform):
   - App name `HORA`, your email as support and contact address, audience **External**.
   - Data access: add the scope `https://www.googleapis.com/auth/calendar.app.created`
     (it is a non-sensitive scope, so no Google review is required).
   - Audience: leave the app in **Testing** and add your own Google account under **Test users**.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type **Web application**, name `HORA web`.
   - **Authorized JavaScript origins**: `https://tamiasdrahcir.github.io` (no trailing slash or path).
     For local development also add `http://localhost:5173`.
   - No redirect URI is needed. Create it and copy the **Client ID**
     (it looks like `1234567890-abc123.apps.googleusercontent.com`). You do not need the client secret.
5. Put the client id in `.env.production`:

   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   ```

   then publish with `npm run deploy`. For local development use `.env.development.local` (it is
   git-ignored; do not use `.env.local`, which production builds also read).

### Troubleshooting

| Message | Fix |
|---|---|
| The Google Calendar API is not enabled for your Google Cloud project | Step 2: enable the API in the same project as the client id |
| Google sign-in shows an origin or redirect error | Step 4: the origin must match exactly, including `https://` and no trailing slash |
| Access blocked / app not verified | Step 3: add your account as a test user |
| Your browser blocked the Google sign-in window | Allow pop-ups for the site |
