// Utility functions for HORA scheduling algorithm

import type { Task, ScheduleBlock, Priority, Objective } from './types';

// The week runs Sunday to Saturday; this order is also the calendar's column order
export const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const PRIORITY_LABELS: Record<string, string> = {
  earth: 'Earth (rigid, important)',
  water: 'Water (flexible, important)',
  fire: 'Fire (rigid, less important)',
  air: 'Air (flexible, less important)',
};
export const WORKING_HOURS = 9; // 9 AM to 6 PM
export const MINUTES_PER_HOUR = 60;

// Sunday 00:00 of the week containing the given date
export function getWeekStartDate(date: Date = new Date()): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// e.g. "Nov 1"
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// e.g. "Sun, Nov 1 - Sat, Nov 7, 2026" (the year is shown on both ends when the week spans two years)
export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const withWeekday = (date: Date, year: boolean) =>
    date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
  const spansYears = weekStart.getFullYear() !== end.getFullYear();
  return `${withWeekday(weekStart, spansYears)} \u2013 ${withWeekday(end, true)}`;
}

export function calculateTotalAvailableHours(hoursPerDay: number): number {
  return hoursPerDay * 5; // Monday to Friday
}

export function priorityScore(priority: Priority): number {
  const scores = { earth: 4, water: 3, fire: 2, air: 1 };
  return scores[priority];
}

// Rigid tasks occur at fixed timeslots and don't consume available hours
export function isRigid(priority: Priority): boolean {
  return priority === 'earth' || priority === 'fire';
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// Parse a military-style interval like "2230-2300" (or "900-1030") into HH:mm times
export function parseMilitaryInterval(input: string): { startTime: string; endTime: string } | null {
  const match = input.trim().match(/^(\d{3,4})\s*-\s*(\d{3,4})$/);
  if (!match) return null;

  const toTime = (raw: string): string | null => {
    const padded = raw.padStart(4, '0');
    const hours = parseInt(padded.slice(0, 2), 10);
    const minutes = parseInt(padded.slice(2), 10);
    if (hours > 23 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  const startTime = toTime(match[1]);
  const endTime = toTime(match[2]);
  if (!startTime || !endTime) return null;
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return null;
  return { startTime, endTime };
}

// Format HH:mm times as a military-style interval, e.g. "22:30"/"23:00" -> "2230-2300"
export function formatMilitaryInterval(startTime: string, endTime: string): string {
  return `${startTime.replace(':', '')}-${endTime.replace(':', '')}`;
}

// Format a block duration in minutes as hours, e.g. "0.83h"
export function formatDurationHours(minutes: number): string {
  return `${parseFloat((minutes / 60).toFixed(2))}h`;
}

export function calculateBalance(objectiveHoursFinished: number, anchorMinutesPassed: number): number {
  return objectiveHoursFinished * 60 - anchorMinutesPassed;
}

export function generateTaskCode(section: string, task: string): string {
  return `${section.toUpperCase()}-${task.toUpperCase()}`;
}

export function generateObjectiveCode(taskCode: string, objective: string): string {
  return `${taskCode}-${objective.toUpperCase()}`;
}

export function parseObjective(objective: Objective): { sectionLength: number; taskLength: number; objLength: number } {
  const parts = objective.code.split('-');
  return {
    sectionLength: parts[0]?.length || 0,
    taskLength: parts[1]?.length || 0,
    objLength: parts[2]?.length || 0,
  };
}

export function isValidTaskCode(code: string): boolean {
  const parts = code.split('-');
  return parts.length === 2 && parts[0].length <= 7 && parts[1].length <= 4;
}

export function isValidObjectiveCode(code: string): boolean {
  const parts = code.split('-');
  return parts.length === 3 && parts[0].length <= 7 && parts[1].length <= 4 && parts[2].length <= 4;
}

export function getTasksByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority));
}

export function getTasksByLoad(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.hoursRequired - a.hoursRequired);
}

export function sortTasksForScheduling(tasks: Task[]): Task[] {
  return [...tasks]
    .sort((a, b) => {
      const priorityDiff = priorityScore(b.priority) - priorityScore(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return b.hoursRequired - a.hoursRequired;
    });
}

export function dayOfWeekToIndex(day: string): number {
  return DAYS_OF_WEEK.indexOf(day);
}

export function indexToDay(index: number): string {
  return DAYS_OF_WEEK[index];
}

// Free gaps inside availability windows on a given day, in minutes from midnight
export function findGapsInWindows(
  blocks: ScheduleBlock[],
  day: string,
  windows: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  const busy = blocks
    .filter(b => b.dayOfWeek === day)
    .map(b => ({ start: timeToMinutes(b.startTime), end: timeToMinutes(b.endTime) }))
    .sort((a, b) => a.start - b.start);

  const gaps: Array<{ start: number; end: number }> = [];
  for (const window of windows) {
    let cursor = window.start;
    for (const block of busy) {
      if (block.end <= cursor || block.start >= window.end) continue;
      if (block.start > cursor) gaps.push({ start: cursor, end: block.start });
      cursor = Math.max(cursor, block.end);
    }
    if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  }
  return gaps;
}

// Find gaps in a day's schedule
export function findGapsInDay(blocks: ScheduleBlock[], day: string, dayStartMinutes: number = 540): Array<{ start: string; end: string; durationMinutes: number }> {
  const dayBlocks = blocks.filter(b => b.dayOfWeek === day).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  const dayEndMinutes = dayStartMinutes + WORKING_HOURS * 60;
  const gaps: Array<{ start: string; end: string; durationMinutes: number }> = [];
  
  let currentTime = dayStartMinutes;
  
  for (const block of dayBlocks) {
    const blockStart = timeToMinutes(block.startTime);
    if (currentTime < blockStart) {
      gaps.push({
        start: minutesToTime(currentTime),
        end: minutesToTime(blockStart),
        durationMinutes: blockStart - currentTime,
      });
    }
    currentTime = Math.max(currentTime, timeToMinutes(block.endTime));
  }
  
  if (currentTime < dayEndMinutes) {
    gaps.push({
      start: minutesToTime(currentTime),
      end: minutesToTime(dayEndMinutes),
      durationMinutes: dayEndMinutes - currentTime,
    });
  }
  
  return gaps;
}

export const WORKING_START = 540; // 9 AM in minutes
export const WORKING_END = WORKING_START + WORKING_HOURS * 60;

// Calculate sporadic hours (gaps bridged by floaters)
export function calculateSporadicHours(floaters: ScheduleBlock[]): number {
  if (floaters.length === 0) return 0;
  
  const sorted = floaters.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  let totalSpan = 0;
  let totalFloaterTime = 0;
  
  const firstStart = timeToMinutes(sorted[0].startTime);
  const lastEnd = timeToMinutes(sorted[sorted.length - 1].endTime);
  
  totalSpan = lastEnd - firstStart;
  totalFloaterTime = sorted.reduce((sum, f) => sum + f.durationMinutes, 0);
  
  return totalSpan - totalFloaterTime; // gap time that can be used
}
