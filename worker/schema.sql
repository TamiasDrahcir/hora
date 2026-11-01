-- One row per browser that turned on notifications
CREATE TABLE IF NOT EXISTS subscriptions (
  hash TEXT PRIMARY KEY,          -- SHA-256 of the push endpoint
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Upcoming alerts waiting to be sent; the app replaces a browser's whole set on every sync
CREATE TABLE IF NOT EXISTS reminders (
  sub_hash TEXT NOT NULL,
  key TEXT NOT NULL,              -- same value the app uses as the notification tag
  fire_at INTEGER NOT NULL,       -- epoch milliseconds
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (sub_hash, key)
);

CREATE INDEX IF NOT EXISTS reminders_fire_at ON reminders (fire_at);
