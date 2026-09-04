// HORA Scheduling Algorithm

import type { Task, ScheduleBlock, WeeklySchedule, Objective, AvailabilityInterval } from './types';
import { sortTasksForScheduling, timeToMinutes, minutesToTime, DAYS_OF_WEEK } from './utils';

export class HORAScheduler {
  private tasks: Task[];
  private totalAvailableMinutes: number;
  private blocks: ScheduleBlock[] = [];
  private blockCounter: number = 0;

  private availability: AvailabilityInterval[];
  private warnings: string[] = [];

  constructor(tasks: Task[], totalAvailableHours: number, availability?: AvailabilityInterval[]) {
    this.tasks = tasks;
    this.totalAvailableMinutes = totalAvailableHours * 60;
    this.availability = availability || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({
      dayOfWeek: day,
      startTime: '09:00',
      endTime: '18:00',
    }));
  }

  schedule(): WeeklySchedule {
    this.blocks = [];
    this.blockCounter = 0;
    this.warnings = this.validateAvailability();

    this.placeRigidTasks();
    this.placeFlexibleTasks();

    return {
      weekStartDate: new Date(),
      blocks: this.blocks,
      totalAvailableHours: this.totalAvailableMinutes / 60,
      totalAnchorHours: this.calculateTotalAnchorHours(),
      totalObjectiveHours: this.calculateTotalObjectiveHours(),
      availability: this.availability,
      warnings: this.warnings,
    };
  }

  private validateAvailability(): string[] {
    const warnings: string[] = [];
    for (const interval of this.availability) {
      if (!DAYS_OF_WEEK.includes(interval.dayOfWeek) || timeToMinutes(interval.endTime) <= timeToMinutes(interval.startTime)) {
        warnings.push(`Availability interval for ${interval.dayOfWeek} is invalid.`);
      }
    }
    return warnings;
  }

  private placeRigidTasks(): void {
    for (const task of this.tasks.filter(task => !task.completed && task.mode === 'rigid')) {
      for (const slot of task.timeSlots || []) {
        const start = timeToMinutes(slot.startTime);
        const end = timeToMinutes(slot.endTime);
        if (end <= start) {
          this.warnings.push(`${task.code} has an invalid time slot.`);
          continue;
        }
        if (this.blocks.some(block => block.dayOfWeek === slot.dayOfWeek && start < timeToMinutes(block.endTime) && end > timeToMinutes(block.startTime))) {
          this.warnings.push(`${task.code} overlaps another rigid block on ${slot.dayOfWeek}.`);
          continue;
        }
        this.addBlock(task, undefined, slot.dayOfWeek, slot.startTime, slot.endTime, end - start, false);
      }
    }
  }

  private placeFlexibleTasks(): void {
    for (const task of sortTasksForScheduling(this.tasks.filter(task => !task.completed && task.mode !== 'rigid'))) {
      const objectives = task.objectives.length > 0 ? task.objectives : [undefined];
      for (const objective of objectives) {
        let remainingMinutes = (objective?.hoursRequired ?? task.hoursRequired) * 60;
        for (const day of DAYS_OF_WEEK) {
          for (const gap of this.getGaps(day)) {
            if (remainingMinutes <= 0) break;
            const minutesToPlace = Math.min(gap.durationMinutes, remainingMinutes);
            const end = timeToMinutes(gap.start) + minutesToPlace;
            this.addBlock(task, objective, day, gap.start, minutesToTime(end), minutesToPlace, minutesToPlace < remainingMinutes);
            remainingMinutes -= minutesToPlace;
          }
        }
        if (remainingMinutes > 0) this.warnings.push(`${objective?.code || task.code} could not be fully scheduled.`);
      }
    }
  }

  private getGaps(day: string): Array<{ start: string; end: string; durationMinutes: number }> {
    const intervals = this.availability.filter(interval => interval.dayOfWeek === day);
    return intervals.flatMap(interval => {
      const start = timeToMinutes(interval.startTime);
      const end = timeToMinutes(interval.endTime);
      if (end <= start) return [];
      const occupied = this.blocks
        .filter(block => block.dayOfWeek === day)
        .map(block => ({ start: timeToMinutes(block.startTime), end: timeToMinutes(block.endTime) }))
        .sort((a, b) => a.start - b.start);
      const gaps: Array<{ start: string; end: string; durationMinutes: number }> = [];
      let cursor = start;
      for (const block of occupied) {
        if (block.end <= start || block.start >= end) continue;
        const blockStart = Math.max(start, block.start);
        if (blockStart > cursor) gaps.push({ start: minutesToTime(cursor), end: minutesToTime(blockStart), durationMinutes: blockStart - cursor });
        cursor = Math.max(cursor, Math.min(end, block.end));
      }
      if (cursor < end) gaps.push({ start: minutesToTime(cursor), end: minutesToTime(end), durationMinutes: end - cursor });
      return gaps;
    });
  }

  private addBlock(
    task: Task,
    objective: Objective | undefined,
    day: string,
    startTime: string,
    endTime: string,
    durationMinutes: number,
    isSporadic: boolean
  ): void {
    const block: ScheduleBlock = {
      id: `block-${++this.blockCounter}`,
      taskId: task.id,
      taskCode: task.code,
      taskName: task.name,
      objectiveId: objective?.id,
      objectiveCode: objective?.code,
      objectiveName: objective?.name,
      priority: task.priority,
      blockType: 'anchor',
      dayOfWeek: day,
      startTime,
      endTime,
      durationMinutes,
      completed: false,
      isSporadic,
      deadline: task.deadline,
      description: objective?.description || task.description,
    };
    
    this.blocks.push(block);
  }

  private calculateTotalAnchorHours(): number {
    return this.blocks.reduce((sum, b) => sum + (b.blockType === 'anchor' ? b.durationMinutes : 0), 0) / 60;
  }

  private calculateTotalObjectiveHours(): number {
    return this.blocks.reduce((sum, b) => sum + b.durationMinutes, 0) / 60;
  }
}

export function scheduleWeek(tasks: Task[], totalAvailableHours: number, availability?: AvailabilityInterval[]): WeeklySchedule {
  const scheduler = new HORAScheduler(tasks, totalAvailableHours, availability);
  return scheduler.schedule();
}
