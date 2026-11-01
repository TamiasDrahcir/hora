-- Alert destinations and the reminders queued for them.
-- A client is one browser, identified by a random id the app generates. It can receive alerts
-- through browser push, a Discord webhook, or both.

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  endpoint TEXT,                  -- Web Push subscription (all three null when push isn't available)
  p256dh TEXT,
  auth TEXT,
  discord_url TEXT,               -- Discord webhook URL, a secret; null when not configured
  updated_at INTEGER NOT NULL
);

-- Upcoming alerts waiting to be sent; the app replaces a client's whole set on every sync
CREATE TABLE IF NOT EXISTS reminders (
  client_id TEXT NOT NULL,
  key TEXT NOT NULL,              -- same value the app uses as the notification tag
  fire_at INTEGER NOT NULL,       -- epoch milliseconds
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (client_id, key)
);

CREATE INDEX IF NOT EXISTS reminders_fire_at ON reminders (fire_at);
