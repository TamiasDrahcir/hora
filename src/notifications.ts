// Browser notifications for upcoming and overdue blocks.
// These only fire while HORA is open in a browser tab; delivery with the tab closed needs a push server.

import { useEffect, useRef } from 'react';
import type { ScheduleBlock, WeeklySchedule } from './types';
import { blockEndTime, blockStartTime, planningWeekStart } from './revenue';

export const LEAD_MINUTES = 5;
const START_GRACE_MS = 5 * 60 * 1000; // still announce a block that began moments ago (e.g. throttled background tab)
const END_GRACE_MS = 60 * 60 * 1000; // don't dig up long-expired blocks when the app is opened late
const CHECK_INTERVAL_MS = 20_000;
const STORAGE_KEY = 'horaNotified';
const PRUNE_AFTER_MS = 10 * 24 * 60 * 60 * 1000;

export interface DueNotification {
  key: string;
  title: string;
  body: string;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

function describeBlock(block: ScheduleBlock): { label: string; detail: string } {
  const label = block.objectiveCode || block.taskCode;
  const detail = block.objectiveName ? `${block.taskName} - ${block.objectiveName}` : block.taskName;
  return { label, detail };
}

// Which notifications should fire right now, skipping ones already sent
export function findDueNotifications(
  blocks: ScheduleBlock[],
  weekStart: Date,
  now: Date,
  alreadyFired: Record<string, number>
): DueNotification[] {
  const due: DueNotification[] = [];
  const weekKey = weekStart.toISOString().slice(0, 10);

  for (const block of blocks) {
    const isFlexible = block.blockType === 'anchor';
    // Mothballed and abandoned work is off the schedule; completed work needs no nudge
    if (isFlexible && (block.status === 'abandoned' || block.status === 'mothballed' || block.completed)) continue;

    const start = blockStartTime(weekStart, block).getTime();
    const end = blockEndTime(weekStart, block).getTime();
    const t = now.getTime();
    // Block identity includes its slot, so moving a block makes it eligible again
    const base = `${weekKey}|${block.id}|${block.dayOfWeek}|${block.startTime}`;
    const { label, detail } = describeBlock(block);
    const when = `${block.dayOfWeek} ${block.startTime} - ${block.endTime}`;

    const startKey = `${base}|start`;
    if (!alreadyFired[startKey] && t >= start - LEAD_MINUTES * 60_000 && t < start + START_GRACE_MS) {
      const minutes = Math.ceil((start - t) / 60_000);
      due.push({
        key: startKey,
        title: minutes > 0 ? `${label} starts in ${minutes} min` : `${label} is starting now`,
        body: `${detail}\n${when}`,
      });
    }

    const endKey = `${base}|end`;
    if (isFlexible && !alreadyFired[endKey] && t >= end && t < end + END_GRACE_MS) {
      due.push({
        key: endKey,
        title: `Time's up: ${label}`,
        body: `${detail}\n${when} ended without being completed. Complete, mothball or abandon it.`,
      });
    }
  }

  return due;
}

function loadFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveFired(fired: Record<string, number>, now: number) {
  const pruned = Object.fromEntries(Object.entries(fired).filter(([, at]) => now - at < PRUNE_AFTER_MS));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
}

export function showNotification(title: string, body: string, tag: string, onOpen?: () => void) {
  if (notificationPermission() !== 'granted') return;
  const notification = new Notification(title, { body, tag });
  notification.onclick = () => {
    window.focus();
    onOpen?.();
    notification.close();
  };
}

// Asks for permission if needed; resolves to whether notifications can be shown
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

// Runs for the lifetime of the app so alerts fire whichever page is open
export function useBlockNotifications(
  schedule: WeeklySchedule | null,
  enabled: boolean,
  onOpen: () => void
) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!enabled || !schedule) return;

    const check = () => {
      if (notificationPermission() !== 'granted') return;

      const now = new Date();
      const fired = loadFired();
      const due = findDueNotifications(
        schedule.blocks,
        planningWeekStart(new Date(schedule.weekStartDate)),
        now,
        fired
      );
      if (due.length === 0) return;

      for (const item of due) {
        showNotification(item.title, item.body, item.key, () => onOpenRef.current());
        fired[item.key] = now.getTime();
      }
      saveFired(fired, now.getTime());
    };

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    // Background tabs throttle timers, so re-check as soon as the tab is visible again
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [schedule, enabled]);
}
