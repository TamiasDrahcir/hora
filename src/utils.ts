// Utility functions for HORA scheduling algorithm

import type { Task, ScheduleBlock, Priority, Objective } from './types';

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WORKING_HOURS = 9; // 9 AM to 6 PM
export const MINUTES_PER_HOUR = 60;

export function getWeekStartDate(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  return new Date(d.setDate(diff));
}

export function calculateTotalAvailableHours(hoursPerDay: number): number {
  return hoursPerDay * 5; // Monday to Friday
}

export function priorityScore(priority: Priority): number {
  const scores = { earth: 4, water: 3, fire: 2, air: 1 };
  return scores[priority];
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
