// HORA push worker
//
//   POST /sync         the app sends its push subscription plus its upcoming reminders;
//                      they replace whatever was stored for that browser
//   POST /unsubscribe  forget a browser
//   cron (every minute) sends reminders whose time has come as Web Push messages

import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

interface Reminder {
  key: string;
  fireAt: number;
  title: string;
  body: string;
}

interface DueRow {
  sub_hash: string;
  key: string;
  title: string;
  body: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const MAX_REQUEST_BYTES = 100_000;
const MAX_REMINDERS = 300;
const MAX_LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000; // a reminder this late is no longer useful
const PUSH_TTL_SECONDS = 30 * 60;
// Workers on the free plan allow 50 outbound requests per invocation
const MAX_SENDS_PER_RUN = 25;

// Only real browser push services are accepted, so the worker can't be pointed at arbitrary URLs
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  '.push.services.mozilla.com',
  '.push.apple.com',
  '.notify.windows.com',
];

function isAllowedPushHost(hostname: string): boolean {
  return PUSH_HOST_SUFFIXES.some(suffix =>
    suffix.startsWith('.') ? hostname.endsWith(suffix) : hostname === suffix
  );
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> | null {
  if (!origin) return {};
  const allowed = env.ALLOWED_ORIGINS.split(',').map(item => item.trim());
  if (!allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBase64Url = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);

function parseSubscription(value: unknown): PushSubscription | null {
  if (!isRecord(value) || typeof value.endpoint !== 'string' || !isRecord(value.keys)) return null;
  if (value.endpoint.length > 1000) return null;

  let url: URL;
  try {
    url = new URL(value.endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !isAllowedPushHost(url.hostname)) return null;

  const { p256dh, auth } = value.keys;
  if (!isBase64Url(p256dh) || !isBase64Url(auth)) return null;

  return { endpoint: value.endpoint, expirationTime: null, keys: { p256dh, auth } };
}

function parseReminders(value: unknown, now: number): Reminder[] {
  if (!Array.isArray(value)) return [];

  const byKey = new Map<string, Reminder>();
  for (const item of value.slice(0, MAX_REMINDERS)) {
    if (!isRecord(item)) continue;
    const { key, fireAt, title, body } = item;
    if (typeof key !== 'string' || key.length === 0 || key.length > 200) continue;
    if (typeof fireAt !== 'number' || !Number.isFinite(fireAt)) continue;
    if (fireAt < now - STALE_AFTER_MS || fireAt > now + MAX_LOOKAHEAD_MS) continue;
    if (typeof title !== 'string' || title.length === 0 || title.length > 150) continue;
    if (typeof body !== 'string' || body.length > 500) continue;
    byKey.set(key, { key, fireAt: Math.round(fireAt), title, body });
  }
  return [...byKey.values()];
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function handleSync(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const body = await readJson(request);
  if (!isRecord(body)) return json({ error: 'Invalid JSON body' }, 400, cors);

  const subscription = parseSubscription(body.subscription);
  if (!subscription) return json({ error: 'Invalid or unsupported push subscription' }, 400, cors);

  const now = Date.now();
  const reminders = parseReminders(body.reminders, now);
  const hash = await sha256Hex(subscription.endpoint);

  // One transaction: the stored set is replaced atomically
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO subscriptions (hash, endpoint, p256dh, auth, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(hash) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, updated_at = ?5`
    ).bind(hash, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, now),
    env.DB.prepare('DELETE FROM reminders WHERE sub_hash = ?').bind(hash),
    ...reminders.map(reminder =>
      env.DB.prepare(
        'INSERT INTO reminders (sub_hash, key, fire_at, title, body) VALUES (?1, ?2, ?3, ?4, ?5)'
      ).bind(hash, reminder.key, reminder.fireAt, reminder.title, reminder.body)
    ),
  ]);

  return json({ ok: true, stored: reminders.length }, 200, cors);
}

async function handleUnsubscribe(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.endpoint !== 'string') return json({ error: 'Invalid JSON body' }, 400, cors);

  const hash = await sha256Hex(body.endpoint);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reminders WHERE sub_hash = ?').bind(hash),
    env.DB.prepare('DELETE FROM subscriptions WHERE hash = ?').bind(hash),
  ]);
  return json({ ok: true }, 200, cors);
}

type Delivery = 'delivered' | 'gone' | 'retry';

async function deliver(row: DueRow, env: Env): Promise<Delivery> {
  try {
    const payload = await buildPushPayload(
      { data: { title: row.title, body: row.body, tag: row.key }, options: { ttl: PUSH_TTL_SECONDS, urgency: 'high' } },
      { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } },
      { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
    );
    const response = await fetch(row.endpoint, payload);

    if (response.ok) return 'delivered';
    // The browser unsubscribed or the subscription expired: stop sending to it
    if (response.status === 404 || response.status === 410) return 'gone';
    console.error(`Push service answered ${response.status} for ${row.sub_hash.slice(0, 8)}`);
    return 'retry';
  } catch (error) {
    console.error('Push send failed', error instanceof Error ? error.message : error);
    return 'retry';
  }
}

async function sendDueReminders(env: Env): Promise<void> {
  const now = Date.now();

  await env.DB.prepare('DELETE FROM reminders WHERE fire_at < ?').bind(now - STALE_AFTER_MS).run();

  const { results } = await env.DB.prepare(
    `SELECT r.sub_hash, r.key, r.title, r.body, s.endpoint, s.p256dh, s.auth
       FROM reminders r JOIN subscriptions s ON s.hash = r.sub_hash
      WHERE r.fire_at <= ?
      ORDER BY r.fire_at
      LIMIT ?`
  ).bind(now, MAX_SENDS_PER_RUN).all<DueRow>();

  if (results.length === 0) return;

  const outcomes = await Promise.all(results.map(row => deliver(row, env)));

  const cleanup: D1PreparedStatement[] = [];
  const goneSubscriptions = new Set<string>();
  results.forEach((row, index) => {
    if (outcomes[index] === 'delivered') {
      cleanup.push(env.DB.prepare('DELETE FROM reminders WHERE sub_hash = ? AND key = ?').bind(row.sub_hash, row.key));
    } else if (outcomes[index] === 'gone') {
      goneSubscriptions.add(row.sub_hash);
    }
  });
  for (const hash of goneSubscriptions) {
    cleanup.push(env.DB.prepare('DELETE FROM reminders WHERE sub_hash = ?').bind(hash));
    cleanup.push(env.DB.prepare('DELETE FROM subscriptions WHERE hash = ?').bind(hash));
  }

  if (cleanup.length > 0) await env.DB.batch(cleanup);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request.headers.get('Origin'), env);
    if (cors === null) return new Response('Origin not allowed', { status: 403 });

    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && pathname === '/') return new Response('hora-push ok', { headers: cors });
    if (request.method === 'POST' && pathname === '/sync') return handleSync(request, env, cors);
    if (request.method === 'POST' && pathname === '/unsubscribe') return handleUnsubscribe(request, env, cors);

    return json({ error: 'Not found' }, 404, cors);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendDueReminders(env));
  },
} satisfies ExportedHandler<Env>;
