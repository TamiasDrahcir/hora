// Delivering alerts while HORA is closed.
//
// The app hands its upcoming reminders to the alert worker, which sends them on schedule through
// either or both of:
//   - browser Web Push (needs VITE_PUSH_API_URL and VITE_VAPID_PUBLIC_KEY, see .env.production)
//   - a Discord webhook, which reaches phone and desktop with no browser involved
// Without a worker URL the app still alerts while a tab is open.

import { useEffect, useState } from 'react';
import type { WeeklySchedule } from './types';
import { buildUpcomingReminders, notificationPermission } from './notifications';
import { planningWeekStart } from './revenue';

const API_URL = ((import.meta.env.VITE_PUSH_API_URL as string | undefined) || '').replace(/\/+$/, '');
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '';
const SYNC_DEBOUNCE_MS = 1500;
const SUBSCRIBE_TIMEOUT_MS = 20_000;
const CLIENT_ID_KEY = 'horaClientId';
const SYNCED_KEY = 'horaAlertsSynced';

export type PushStatus = 'off' | 'unconfigured' | 'unsupported' | 'syncing' | 'ready' | 'error';
export type DiscordStatus = 'off' | 'syncing' | 'ready' | 'error';

export interface PushState {
  status: PushStatus;
  error: string | null; // plain-language reason when status is 'error'
}

export interface DiscordState {
  status: DiscordStatus;
  error: string | null;
}

export interface AlertSyncState {
  push: PushState;
  discord: DiscordState;
}

export const workerConfigured = Boolean(API_URL);
export const pushConfigured = Boolean(API_URL && VAPID_PUBLIC_KEY);

// Same shape the worker accepts: https discord.com/discordapp.com /api/webhooks/<id>/<token>
const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api\/(?:v\d+\/)?webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,200}$/;

export function isValidDiscordWebhook(url: string): boolean {
  return DISCORD_WEBHOOK_PATTERN.test(url.trim());
}

export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

// Turns a browser or network failure into something a person can act on
export function describePushError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);

  if (name === 'AbortError') {
    return `Your browser couldn't reach its push service (${message}). Some browsers, such as Brave, have push messaging switched off in their privacy settings.`;
  }
  if (name === 'NotAllowedError') return 'The browser refused notifications for this site. Allow them in the site settings.';
  if (name === 'TimeoutError') {
    return `The browser didn't respond while setting up push (${message}). Embedded browsers, such as the VS Code preview, can't run service workers. Open HORA in Edge, Chrome or Firefox.`;
  }
  if (name === 'InvalidStateError') return `The browser's push subscription is in a bad state (${message}). Try turning Notifications off and on again.`;
  if (name === 'TypeError') {
    return `Couldn't reach the alert worker (${message}). A privacy extension, VPN or network filter may be blocking ${new URL(API_URL).host}.`;
  }
  return `${name ? `${name}: ` : ''}${message}`;
}

// Some embedded browsers never settle a service-worker registration; fail loudly instead of hanging
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`no response after ${ms / 1000}s`);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

// A random id that stands for this browser on the worker; it never leaves the app otherwise
function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function urlBase64ToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  return navigator.serviceWorker.ready;
}

// Returns the browser's push subscription, creating it if needed (notification permission must already be granted)
async function subscribePush(): Promise<PushSubscription> {
  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY),
  });
}

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : '';
    throw new Error(reason || `Alert worker answered ${response.status}`);
  }
  return data;
}

// Sends a test message through the worker so a mistyped or deleted webhook is caught straight away
export async function testDiscordWebhook(webhook: string): Promise<void> {
  if (!workerConfigured) throw new Error('This build of HORA has no alert worker configured.');
  await post('/discord/test', { discordWebhook: webhook.trim() });
}

// Drops this browser's push subscription (the worker is updated by the next sync)
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch (error) {
    console.error('Could not unsubscribe from push', error);
  }
}

const OFF: AlertSyncState = {
  push: { status: 'off', error: null },
  discord: { status: 'off', error: null },
};

// Keeps the worker's copy of your upcoming alerts, and where to send them, in step with the app
export function useAlertSync(
  schedule: WeeklySchedule | null,
  notificationsOn: boolean,
  discordWebhook: string
): AlertSyncState {
  const [state, setState] = useState<AlertSyncState>(OFF);

  useEffect(() => {
    const webhook = discordWebhook.trim();
    const wantDiscord = workerConfigured && isValidDiscordWebhook(webhook);
    const wantPush =
      notificationsOn && pushConfigured && pushSupported() && notificationPermission() === 'granted';

    // Why push isn't being attempted, for the status line
    let idlePush: PushStatus = 'off';
    if (notificationsOn && !pushConfigured) idlePush = 'unconfigured';
    else if (notificationsOn && !pushSupported()) idlePush = 'unsupported';

    const discordProblem =
      webhook && !isValidDiscordWebhook(webhook)
        ? "That doesn't look like a Discord webhook URL."
        : webhook && !workerConfigured
          ? 'This build of HORA has no alert worker configured.'
          : null;

    if (!wantPush && !wantDiscord) {
      setState({
        push: { status: idlePush, error: null },
        discord: discordProblem ? { status: 'error', error: discordProblem } : { status: 'off', error: null },
      });
      // Nothing left to deliver to: make the worker forget this browser
      if (workerConfigured && localStorage.getItem(SYNCED_KEY)) {
        post('/unsubscribe', { clientId: getClientId() })
          .then(() => localStorage.removeItem(SYNCED_KEY))
          .catch(() => undefined);
      }
      return;
    }

    let cancelled = false;
    setState({
      push: wantPush ? { status: 'syncing', error: null } : { status: idlePush, error: null },
      discord: wantDiscord ? { status: 'syncing', error: null } : { status: 'off', error: null },
    });

    // Debounced so a burst of edits (e.g. dragging blocks) sends one sync
    const timer = setTimeout(async () => {
      // A push failure must not stop Discord alerts, so it is recorded and the sync carries on
      let subscription: PushSubscription | null = null;
      let pushError: string | null = null;
      if (wantPush) {
        try {
          subscription = await withTimeout(subscribePush(), SUBSCRIBE_TIMEOUT_MS);
        } catch (error) {
          console.error('Push subscription failed', error);
          pushError = describePushError(error);
        }
      }

      try {
        // Nothing to deliver to (push failed and no webhook): don't keep an empty record on the worker
        if (!subscription && !wantDiscord) {
          await post('/unsubscribe', { clientId: getClientId() });
          localStorage.removeItem(SYNCED_KEY);
          if (!cancelled) {
            setState({ push: { status: 'error', error: pushError }, discord: { status: 'off', error: null } });
          }
          return;
        }

        const reminders = schedule
          ? buildUpcomingReminders(schedule.blocks, planningWeekStart(new Date(schedule.weekStartDate)), new Date())
          : [];
        await post('/sync', {
          clientId: getClientId(),
          subscription: subscription ? subscription.toJSON() : null,
          discordWebhook: wantDiscord ? webhook : null,
          reminders: reminders.map(({ key, fireAt, title, body }) => ({ key, fireAt, title, body })),
        });
        localStorage.setItem(SYNCED_KEY, '1');

        if (cancelled) return;
        setState({
          push: !wantPush
            ? { status: idlePush, error: null }
            : subscription
              ? { status: 'ready', error: null }
              : { status: 'error', error: pushError },
          discord: wantDiscord ? { status: 'ready', error: null } : { status: 'off', error: null },
        });
      } catch (error) {
        console.error('Alert sync failed', error);
        if (cancelled) return;
        const message = describePushError(error);
        setState({
          push: wantPush ? { status: 'error', error: pushError || message } : { status: idlePush, error: null },
          discord: wantDiscord ? { status: 'error', error: message } : { status: 'off', error: null },
        });
      }
    }, SYNC_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [schedule, notificationsOn, discordWebhook]);

  return state;
}
