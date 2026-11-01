// Revenue accounting for the Execute page
//
// Nominal revenue: time worth of tasks that should be finished by now, per the schedule
// Actual revenue:  time worth of tasks actually completed
// Closet debt:     time worth of tasks currently mothballed
// Lost revenue:    time worth of tasks abandoned
// Balance:         actual - nominal (mothballed and abandoned tasks no longer count towards nominal)

import type { ScheduleBlock } from './types';
import { DAYS_OF_WEEK, getWeekStartDate, timeToMinutes } from './utils';

export interface RevenueStats {
  nominal: number; // minutes
  actual: number;
  closetDebt: number;
  lost: number;
  balance: number;
}

// Sunday 00:00 of the week a schedule applies to (weeks run Sunday to Saturday)
export function planningWeekStart(date: Date): Date {
  return getWeekStartDate(date);
}

function blockDate(weekStart: Date, day: string, time: string): Date {
  const minutes = timeToMinutes(time);
  return new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + DAYS_OF_WEEK.indexOf(day),
    Math.floor(minutes / 60),
    minutes % 60
  );
}

export function blockStartTime(weekStart: Date, block: ScheduleBlock): Date {
  return blockDate(weekStart, block.dayOfWeek, block.startTime);
}

export function blockEndTime(weekStart: Date, block: ScheduleBlock): Date {
  return blockDate(weekStart, block.dayOfWeek, block.endTime);
}

export function computeRevenue(blocks: ScheduleBlock[], weekStart: Date, now: Date): RevenueStats {
  let nominal = 0;
  let actual = 0;
  let closetDebt = 0;
  let lost = 0;

  // Only flexible work earns revenue; rigid events don't count towards your hours
  for (const block of blocks.filter(b => b.blockType === 'anchor')) {
    const status = block.status || 'active';

    if (status === 'abandoned') {
      lost += block.durationMinutes;
      continue;
    }
    if (status === 'mothballed') {
      closetDebt += block.durationMinutes;
      continue;
    }

    if (block.completed) actual += block.durationMinutes;
    if (blockEndTime(weekStart, block) <= now) nominal += block.durationMinutes;
  }

  return { nominal, actual, closetDebt, lost, balance: actual - nominal };
}

// e.g. 150 -> "2h 30m"
export function formatMinutes(minutes: number): string {
  const total = Math.abs(Math.round(minutes));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}
