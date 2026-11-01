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

export type PushStatus = 'off' | 'unconfigured' | 'unsupported' | 'syncing' | 'ready' | 'error';

export const pushConfigured = Boolean(API_URL && VAPID_PUBLIC_KEY);

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
export function usePushSync(schedule: WeeklySchedule | null, enabled: boolean): PushStatus {
  const [status, setStatus] = useState<PushStatus>('off');

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    if (!pushConfigured) {
      setStatus('unconfigured');
      return;
    }
    if (!pushSupported()) {
      setStatus('unsupported');
      return;
    }
    if (notificationPermission() !== 'granted') {
      setStatus('off');
      return;
    }

    let cancelled = false;
    setStatus('syncing');

    // Debounced so a burst of edits (e.g. dragging blocks) sends one sync
    const timer = setTimeout(async () => {
      try {
        const subscription = await subscribePush();
        const reminders = schedule
          ? buildUpcomingReminders(schedule.blocks, planningWeekStart(new Date(schedule.weekStartDate)), new Date())
          : [];
        await syncReminders(subscription, reminders);
        if (!cancelled) setStatus('ready');
      } catch (error) {
        console.error('Push sync failed', error);
        if (!cancelled) setStatus('error');
      }
    }, SYNC_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [schedule, enabled]);

  return status;
}
