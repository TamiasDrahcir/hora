// HORA alert worker
//
//   POST /sync          the app sends its alert destinations (browser push and/or a Discord webhook)
//                       plus its upcoming reminders; they replace whatever was stored for that client
//   POST /unsubscribe   forget a client entirely
//   POST /discord/test  send a test message to a Discord webhook so the user can check it works
//   cron (every minute) delivers reminders whose time has come to every destination of their client

import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  // Tests only: send Discord requests to a mock server instead of discord.com
  DISCORD_API_ORIGIN?: string;
}

interface Reminder {
  key: string;
  fireAt: number;
  title: string;
  body: string;
}

interface DueRow {
  client_id: string;
  key: string;
  title: string;
  body: string;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  discord_url: string | null;
}

type Delivery = 'delivered' | 'gone' | 'retry';

const MAX_REQUEST_BYTES = 100_000;
const MAX_REMINDERS = 300;
const MAX_LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000; // a reminder this late is no longer useful
const PUSH_TTL_SECONDS = 30 * 60;
// Workers on the free plan allow 50 outbound requests per invocation, and a reminder can use two
const MAX_REMINDERS_PER_RUN = 20;

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api\/(?:v\d+\/)?webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,200}$/;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBase64Url = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);

// "absent" means the destination isn't configured; "invalid" means it was sent but is unusable
type Parsed<T> = { kind: 'absent' } | { kind: 'invalid' } | { kind: 'ok'; value: T };

function parseSubscription(value: unknown): Parsed<PushSubscription> {
  if (value === null || value === undefined) return { kind: 'absent' };
  if (!isRecord(value) || typeof value.endpoint !== 'string' || !isRecord(value.keys)) return { kind: 'invalid' };
  if (value.endpoint.length > 1000) return { kind: 'invalid' };

  let url: URL;
  try {
    url = new URL(value.endpoint);
  } catch {
    return { kind: 'invalid' };
  }
  if (url.protocol !== 'https:' || !isAllowedPushHost(url.hostname)) return { kind: 'invalid' };

  const { p256dh, auth } = value.keys;
  if (!isBase64Url(p256dh) || !isBase64Url(auth)) return { kind: 'invalid' };

  return { kind: 'ok', value: { endpoint: value.endpoint, expirationTime: null, keys: { p256dh, auth } } };
}

function parseDiscordWebhook(value: unknown): Parsed<string> {
  if (value === null || value === undefined || value === '') return { kind: 'absent' };
  if (typeof value !== 'string' || !DISCORD_WEBHOOK_PATTERN.test(value)) return { kind: 'invalid' };
  return { kind: 'ok', value };
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

function parseClientId(value: unknown): string | null {
  return typeof value === 'string' && CLIENT_ID_PATTERN.test(value) ? value : null;
}

async function handleSync(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const body = await readJson(request);
  if (!isRecord(body)) return json({ error: 'Invalid JSON body' }, 400, cors);

  const clientId = parseClientId(body.clientId);
  if (!clientId) return json({ error: 'Invalid client id' }, 400, cors);

  const subscription = parseSubscription(body.subscription);
  if (subscription.kind === 'invalid') return json({ error: 'Invalid or unsupported push subscription' }, 400, cors);

  const discord = parseDiscordWebhook(body.discordWebhook);
  if (discord.kind === 'invalid') return json({ error: 'Invalid Discord webhook URL' }, 400, cors);

  const now = Date.now();
  const reminders = parseReminders(body.reminders, now);
  const push = subscription.kind === 'ok' ? subscription.value : null;
  const webhook = discord.kind === 'ok' ? discord.value : null;

  // One transaction: what is stored for this client is replaced atomically
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO clients (id, endpoint, p256dh, auth, discord_url, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, discord_url = ?5, updated_at = ?6`
    ).bind(clientId, push?.endpoint ?? null, push?.keys.p256dh ?? null, push?.keys.auth ?? null, webhook, now),
    env.DB.prepare('DELETE FROM reminders WHERE client_id = ?').bind(clientId),
    ...reminders.map(reminder =>
      env.DB.prepare(
        'INSERT INTO reminders (client_id, key, fire_at, title, body) VALUES (?1, ?2, ?3, ?4, ?5)'
      ).bind(clientId, reminder.key, reminder.fireAt, reminder.title, reminder.body)
    ),
  ]);

  return json({ ok: true, stored: reminders.length, push: push !== null, discord: webhook !== null }, 200, cors);
}

async function handleUnsubscribe(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const body = await readJson(request);
  const clientId = isRecord(body) ? parseClientId(body.clientId) : null;
  if (!clientId) return json({ error: 'Invalid client id' }, 400, cors);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM reminders WHERE client_id = ?').bind(clientId),
    env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(clientId),
  ]);
  return json({ ok: true }, 200, cors);
}

// Discord webhook URLs carry a secret token, so they are never logged
function discordTarget(webhookUrl: string, env: Env): string {
  if (!env.DISCORD_API_ORIGIN) return webhookUrl;
  return env.DISCORD_API_ORIGIN.replace(/\/+$/, '') + new URL(webhookUrl).pathname;
}

async function postToDiscord(webhookUrl: string, content: string, env: Env): Promise<Delivery> {
  try {
    const response = await fetch(discordTarget(webhookUrl, env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // allowed_mentions: task names must never be able to ping @everyone or roles
      body: JSON.stringify({ username: 'HORA', content, allowed_mentions: { parse: [] } }),
    });

    if (response.ok) return 'delivered';
    // The webhook was deleted or its token is wrong: stop using it
    if (response.status === 401 || response.status === 403 || response.status === 404) return 'gone';
    console.error(`Discord answered ${response.status}`);
    return 'retry';
  } catch (error) {
    console.error('Discord send failed', error instanceof Error ? error.message : error);
    return 'retry';
  }
}

async function handleDiscordTest(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const body = await readJson(request);
  const webhook = isRecord(body) ? parseDiscordWebhook(body.discordWebhook) : ({ kind: 'invalid' } as const);
  if (webhook.kind !== 'ok') return json({ error: "That doesn't look like a Discord webhook URL" }, 400, cors);

  const result = await postToDiscord(webhook.value, '**HORA is connected**\nAlerts about your schedule will appear here.', env);
  if (result === 'delivered') return json({ ok: true }, 200, cors);
  if (result === 'gone') return json({ error: 'Discord rejected this webhook. It may have been deleted or mistyped.' }, 400, cors);
  return json({ error: 'Discord could not be reached right now. Try again in a moment.' }, 502, cors);
}

async function deliverPush(row: DueRow, env: Env): Promise<Delivery> {
  if (!row.endpoint || !row.p256dh || !row.auth) return 'gone';
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
    console.error(`Push service answered ${response.status}`);
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
    `SELECT r.client_id, r.key, r.title, r.body, c.endpoint, c.p256dh, c.auth, c.discord_url
       FROM reminders r JOIN clients c ON c.id = r.client_id
      WHERE r.fire_at <= ?
      ORDER BY r.fire_at
      LIMIT ?`
  ).bind(now, MAX_REMINDERS_PER_RUN).all<DueRow>();

  if (results.length === 0) return;

  const outcomes = await Promise.all(
    results.map(async row => ({
      push: row.endpoint ? await deliverPush(row, env) : undefined,
      discord: row.discord_url
        ? await postToDiscord(row.discord_url, `**${row.title}**\n${row.body}`, env)
        : undefined,
    }))
  );

  const cleanup: D1PreparedStatement[] = [];
  const deadPush = new Set<string>();
  const deadDiscord = new Set<string>();

  results.forEach((row, index) => {
    const { push, discord } = outcomes[index];
    const attempted = [push, discord].filter((value): value is Delivery => value !== undefined);

    if (push === 'gone') deadPush.add(row.client_id);
    if (discord === 'gone') deadDiscord.add(row.client_id);

    // Done once any channel delivered, or when nothing can ever deliver it; otherwise retry next minute
    const done = attempted.length === 0 || attempted.includes('delivered') || attempted.every(value => value === 'gone');
    if (done) {
      cleanup.push(env.DB.prepare('DELETE FROM reminders WHERE client_id = ? AND key = ?').bind(row.client_id, row.key));
    }
  });

  for (const id of deadPush) {
    cleanup.push(env.DB.prepare('UPDATE clients SET endpoint = NULL, p256dh = NULL, auth = NULL WHERE id = ?').bind(id));
  }
  for (const id of deadDiscord) {
    cleanup.push(env.DB.prepare('UPDATE clients SET discord_url = NULL WHERE id = ?').bind(id));
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
    if (request.method === 'POST' && pathname === '/discord/test') return handleDiscordTest(request, env, cors);

    return json({ error: 'Not found' }, 404, cors);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendDueReminders(env));
  },
} satisfies ExportedHandler<Env>;
