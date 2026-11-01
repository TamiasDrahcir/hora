// Keeps Google Calendar in step with HORA's schedules.
//
// The app reports the events that should be on Google Calendar (setSyncBatch) whenever they may have
// changed. After the first manual sync, a change to that batch triggers a sync automatically (while the
// Google sign-in is still valid). Syncs never overlap: each one wipes the HORA events and re-adds the
// batch, so two running at once could interleave and leave duplicates.

import { useSyncExternalStore } from 'react';
import { eventsSignature, type CalendarEvent } from './calendarEvents';
import { googleConfigured, hasGoogleToken, syncToGoogleCalendar } from './googleCalendar';

const SYNCED_SIGNATURE_KEY = 'horaGoogleSyncSignature';
const AUTO_SYNC_KEY = 'horaGoogleAutoSync';
const AUTO_SYNC_DELAY_MS = 2000;

export interface SyncMessage {
  kind: 'ok' | 'error';
  text: string;
}

export interface GoogleSyncSnapshot {
  working: boolean;
  message: SyncMessage | null;
  autoSync: boolean;
  outOfDate: boolean; // Google Calendar doesn't match the latest schedules
  needsSignIn: boolean; // out of date, and auto-sync can't run until the user signs in again
}

interface Batch {
  events: CalendarEvent[];
  from: Date; // HORA events on Google Calendar from this moment onward are replaced
  signature: string;
}

let batch: Batch | null = null;
let syncedSignature: string | null = localStorage.getItem(SYNCED_SIGNATURE_KEY);
let autoSync = localStorage.getItem(AUTO_SYNC_KEY) !== 'off';
let working = false;
let message: SyncMessage | null = null;
let lastAttempt: string | null = null; // each version of the batch is tried automatically only once
let timer: ReturnType<typeof setTimeout> | undefined;

const listeners = new Set<() => void>();
let snapshot: GoogleSyncSnapshot = computeSnapshot();

function computeSnapshot(): GoogleSyncSnapshot {
  const outOfDate = googleConfigured && syncedSignature !== null && batch !== null && batch.signature !== syncedSignature;
  return {
    working,
    message,
    autoSync,
    outOfDate,
    needsSignIn: outOfDate && autoSync && !working && !hasGoogleToken(),
  };
}

function emit(): void {
  snapshot = computeSnapshot();
  listeners.forEach(listener => listener());
}

function scheduleAutoSync(): void {
  clearTimeout(timer);
  timer = undefined;
  if (!googleConfigured || !autoSync || working || !batch || syncedSignature === null) return;
  if (batch.signature === syncedSignature || batch.signature === lastAttempt) return;
  if (!hasGoogleToken()) return; // signing in needs a click, so it can't happen in the background
  timer = setTimeout(() => void runSync(true), AUTO_SYNC_DELAY_MS);
}

async function runSync(automatic: boolean): Promise<void> {
  if (working || !batch) return;

  clearTimeout(timer);
  timer = undefined;
  const current = batch;
  working = true;
  lastAttempt = current.signature;
  if (!automatic) message = null;
  emit();

  try {
    const result = await syncToGoogleCalendar(current.events, current.from);
    syncedSignature = current.signature;
    localStorage.setItem(SYNCED_SIGNATURE_KEY, current.signature);
    message = {
      kind: 'ok',
      text:
        `${automatic ? 'Updated Google Calendar' : 'Synced'}: removed ${result.deleted} and added ${result.created} ` +
        `event${result.created !== 1 ? 's' : ''}.`,
    };
  } catch (error) {
    message = { kind: 'error', text: error instanceof Error ? error.message : String(error) };
  } finally {
    working = false;
    emit();
    // The schedule may have changed while this sync was running
    scheduleAutoSync();
  }
}

// Reports the events Google Calendar should hold; call whenever the schedules may have changed
export function setSyncBatch(events: CalendarEvent[], from: Date): void {
  const signature = `${from.getTime()}:${eventsSignature(events)}`;
  if (batch?.signature === signature) return;
  batch = { events, from, signature };
  emit();
  scheduleAutoSync();
}

export function syncNow(): void {
  void runSync(false);
}

export function setAutoSync(enabled: boolean): void {
  autoSync = enabled;
  localStorage.setItem(AUTO_SYNC_KEY, enabled ? 'on' : 'off');
  emit();
  scheduleAutoSync();
}

export function useGoogleSync(): GoogleSyncSnapshot {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot
  );
}
