// Notifications for upcoming and overdue blocks.
//
// While HORA is open the app raises them itself (useBlockNotifications). The same alerts are also
// handed to the push worker (see push.ts) so they arrive with the tab closed. Both use the same
// key as the notification tag, so a device never shows the same alert twice.

import { useEffect, useRef } from 'react';
import type { ScheduleBlock, WeeklySchedule } from './types';
import { blockEndTime, blockStartTime, planningWeekStart } from './revenue';

export const LEAD_MINUTES = 5;
const LEAD_MS = LEAD_MINUTES * 60_000;
const START_GRACE_MS = 5 * 60 * 1000; // still announce a block that began moments ago (e.g. throttled background tab)
const END_GRACE_MS = 60 * 60 * 1000; // don't dig up long-expired blocks when the app is opened late
const REMINDER_HORIZON_MS = 8 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 20_000;
const STORAGE_KEY = 'horaNotified';
const PRUNE_AFTER_MS = 10 * 24 * 60 * 60 * 1000;

export interface DueNotification {
  key: string;
  title: string;
  body: string;
}

export interface Reminder extends DueNotification {
  fireAt: number; // epoch milliseconds
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

// Mothballed and abandoned work is off the schedule; completed work needs no nudge
function needsAlerts(block: ScheduleBlock): boolean {
  if (block.blockType !== 'anchor') return true;
  return block.status !== 'abandoned' && block.status !== 'mothballed' && !block.completed;
}

// Block identity includes its slot, so moving a block makes it eligible again
function reminderBase(weekStart: Date, block: ScheduleBlock): string {
  return `${weekStart.toISOString().slice(0, 10)}|${block.id}|${block.dayOfWeek}|${block.startTime}`;
}

function describeBlock(block: ScheduleBlock): { label: string; detail: string; when: string } {
  return {
    label: block.objectiveCode || block.taskCode,
    detail: block.objectiveName ? `${block.taskName} - ${block.objectiveName}` : block.taskName,
    when: `${block.dayOfWeek} ${block.startTime} - ${block.endTime}`,
  };
}

function startMessage(block: ScheduleBlock, minutesAway: number): { title: string; body: string } {
  const { label, detail, when } = describeBlock(block);
  return {
    title: minutesAway > 0 ? `${label} starts in ${minutesAway} min` : `${label} is starting now`,
    body: `${detail}\n${when}`,
  };
}

function endMessage(block: ScheduleBlock): { title: string; body: string } {
  const { label, detail, when } = describeBlock(block);
  return {
    title: `Time's up: ${label}`,
    body: `${detail}\n${when} ended without being completed. Complete, mothball or abandon it.`,
  };
}

// Which notifications should fire right now, skipping ones already sent
export function findDueNotifications(
  blocks: ScheduleBlock[],
  weekStart: Date,
  now: Date,
  alreadyFired: Record<string, number>
): DueNotification[] {
  const due: DueNotification[] = [];
  const t = now.getTime();

  for (const block of blocks) {
    if (!needsAlerts(block)) continue;

    const start = blockStartTime(weekStart, block).getTime();
    const end = blockEndTime(weekStart, block).getTime();
    const base = reminderBase(weekStart, block);

    const startKey = `${base}|start`;
    if (!alreadyFired[startKey] && t >= start - LEAD_MS && t < start + START_GRACE_MS) {
      due.push({ key: startKey, ...startMessage(block, Math.ceil((start - t) / 60_000)) });
    }

    const endKey = `${base}|end`;
    if (block.blockType === 'anchor' && !alreadyFired[endKey] && t >= end && t < end + END_GRACE_MS) {
      due.push({ key: endKey, ...endMessage(block) });
    }
  }

  return due;
}

// Every alert that will still need to fire, with its time, for the push worker to send
export function buildUpcomingReminders(blocks: ScheduleBlock[], weekStart: Date, now: Date): Reminder[] {
  const reminders: Reminder[] = [];
  const t = now.getTime();

  for (const block of blocks) {
    if (!needsAlerts(block)) continue;

    const startAlertAt = blockStartTime(weekStart, block).getTime() - LEAD_MS;
    const endAlertAt = blockEndTime(weekStart, block).getTime();
    const base = reminderBase(weekStart, block);

    // Only future alerts: ones already due are handled by the open app, so a re-sync can't resend them
    if (startAlertAt > t && startAlertAt <= t + REMINDER_HORIZON_MS) {
      reminders.push({ key: `${base}|start`, fireAt: startAlertAt, ...startMessage(block, LEAD_MINUTES) });
    }
    if (block.blockType === 'anchor' && endAlertAt > t && endAlertAt <= t + REMINDER_HORIZON_MS) {
      reminders.push({ key: `${base}|end`, fireAt: endAlertAt, ...endMessage(block) });
    }
  }

  return reminders.sort((a, b) => a.fireAt - b.fireAt);
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
