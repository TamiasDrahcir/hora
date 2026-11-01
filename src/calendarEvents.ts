// Turns the confirmed schedule into calendar events, for the .ics export and Google Calendar sync.

import type { Priority, Task, WeeklySchedule } from './types';
import { PRIORITY_LABELS, isRigid } from './utils';
import { blockEndTime, blockStartTime, planningWeekStart } from './revenue';

export const REMINDER_MINUTES = 5;

export interface CalendarEvent {
  uid: string; // stable across exports and syncs, so the same block always maps to the same event
  weekKey: string; // local date (YYYY-MM-DD) of the Monday the schedule belongs to
  summary: string;
  description: string;
  start: Date;
  end: Date;
  priority: Priority;
  remind: boolean; // finished blocks no longer need a reminder
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function scheduleWeekKey(schedule: WeeklySchedule): string {
  return localDateKey(planningWeekStart(new Date(schedule.weekStartDate)));
}

// Mothballed and abandoned work is off the schedule, so it doesn't belong on a calendar
export function buildCalendarEvents(schedule: WeeklySchedule, tasks: Task[]): CalendarEvent[] {
  const weekStart = planningWeekStart(new Date(schedule.weekStartDate));
  const weekKey = localDateKey(weekStart);

  return schedule.blocks
    .filter(block => block.status !== 'abandoned' && block.status !== 'mothballed')
    .map(block => {
      const task = tasks.find(item => item.id === block.taskId);
      const label = block.objectiveCode || block.taskCode;
      const name = block.objectiveName ? `${block.taskName} - ${block.objectiveName}` : block.taskName;

      const lines = [label, PRIORITY_LABELS[block.priority] || block.priority];
      if (task && !isRigid(task.priority)) {
        lines.push(`Task total: ${task.hoursRequired}h`);
        if (task.deadline) lines.push(`Deadline: ${task.deadline}`);
      }
      const note = task?.description || block.description;
      if (note) lines.push('', note);
      lines.push('', 'Scheduled by HORA');

      return {
        uid: `${weekKey}-${block.id}`,
        weekKey,
        summary: `${block.completed ? '\u2713 ' : ''}${name}`,
        description: lines.join('\n'),
        start: blockStartTime(weekStart, block),
        end: blockEndTime(weekStart, block),
        priority: block.priority,
        remind: !block.completed,
      };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---------- .ics (RFC 5545) ----------

const escapeText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

// Content lines may not exceed 75 octets; longer ones continue on the next line after a space
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(events: CalendarEvent[], now: Date = new Date()): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HORA//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:HORA',
  ];

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}@hora`,
      `DTSTAMP:${formatUtc(now)}`,
      `DTSTART:${formatUtc(event.start)}`,
      `DTEND:${formatUtc(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      `CATEGORIES:${event.priority.toUpperCase()}`
    );
    if (event.remind) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(event.summary)}`,
        `TRIGGER:-PT${REMINDER_MINUTES}M`,
        'END:VALARM'
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function downloadIcs(events: CalendarEvent[]): string {
  const weekKey = events[0]?.weekKey ?? localDateKey(new Date());
  const fileName = `hora-week-${weekKey}.ics`;

  const url = URL.createObjectURL(new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return fileName;
}
