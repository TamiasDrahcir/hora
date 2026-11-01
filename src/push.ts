// Web Push: lets the push worker deliver HORA alerts while the app is closed.
// Needs VITE_PUSH_API_URL and VITE_VAPID_PUBLIC_KEY (see .env.production); without them the app
// still alerts while a tab is open.

import { useEffect, useState } from 'react';
import type { WeeklySchedule } from './types';
import { buildUpcomingReminders, notificationPermission, type Reminder } from './notifications';
import { planningWeekStart } from './revenue';

const API_URL = ((import.meta.env.VITE_PUSH_API_URL as string | undefined) || '').replace(/\/+$/, '');
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '';
const SYNC_DEBOUNCE_MS = 1500;
const SUBSCRIBE_TIMEOUT_MS = 20_000;

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

export type PushStatus = 'off' | 'unconfigured' | 'unsupported' | 'syncing' | 'ready' | 'error';

export interface PushState {
  status: PushStatus;
  error: string | null; // plain-language reason when status is 'error'
}

export const pushConfigured = Boolean(API_URL && VAPID_PUBLIC_KEY);

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
    return `Couldn't reach the push worker (${message}). A privacy extension, VPN or network filter may be blocking ${new URL(API_URL).host}.`;
  }
  return `${name ? `${name}: ` : ''}${message}`;
}

export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
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

async function post(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Push worker answered ${response.status}`);
}

async function syncReminders(subscription: PushSubscription, reminders: Reminder[]): Promise<void> {
  await post('/sync', {
    subscription: subscription.toJSON(),
    reminders: reminders.map(({ key, fireAt, title, body }) => ({ key, fireAt, title, body })),
  });
}

// Stops background alerts for this browser (best effort: the server also drops dead subscriptions itself)
export async function unsubscribePush(): Promise<void> {
  if (!pushConfigured || !pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await post('/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch (error) {
    console.error('Could not unsubscribe from push', error);
  }
}

// Keeps the push worker's copy of your upcoming alerts in step with the schedule
export function usePushSync(schedule: WeeklySchedule | null, enabled: boolean): PushState {
  const [state, setState] = useState<PushState>({ status: 'off', error: null });

  useEffect(() => {
    const set = (status: PushStatus, error: string | null = null) => setState({ status, error });

    if (!enabled) {
      set('off');
      return;
    }
    if (!pushConfigured) {
      set('unconfigured');
      return;
    }
    if (!pushSupported()) {
      set('unsupported');
      return;
    }
    if (notificationPermission() !== 'granted') {
      set('off');
      return;
    }

    let cancelled = false;
    set('syncing');

    // Debounced so a burst of edits (e.g. dragging blocks) sends one sync
    const timer = setTimeout(async () => {
      try {
        const subscription = await withTimeout(subscribePush(), SUBSCRIBE_TIMEOUT_MS);
        const reminders = schedule
          ? buildUpcomingReminders(schedule.blocks, planningWeekStart(new Date(schedule.weekStartDate)), new Date())
          : [];
        await syncReminders(subscription, reminders);
        if (!cancelled) set('ready');
      } catch (error) {
        console.error('Push sync failed', error);
        if (!cancelled) set('error', describePushError(error));
      }
    }, SYNC_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [schedule, enabled]);

  return state;
}
