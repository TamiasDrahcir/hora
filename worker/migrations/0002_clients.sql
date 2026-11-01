-- Upgrade from the first version (push-only tables keyed by a hash of the push endpoint) to
-- clients that can have push, Discord, or both. Run once on an existing database:
--   npx wrangler d1 execute hora-push --remote --file=./migrations/0002_clients.sql
-- Existing rows are dropped: reminders are rebuilt by the app on its next sync.

DROP TABLE IF EXISTS reminders;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS clients;

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT,
  discord_url TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE reminders (
  client_id TEXT NOT NULL,
  key TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (client_id, key)
);

CREATE INDEX reminders_fire_at ON reminders (fire_at);
