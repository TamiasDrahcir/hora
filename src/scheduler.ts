// HORA Scheduling Algorithm

import type { Task, ScheduleBlock, WeeklySchedule, Objective } from './types';
import {
  sortTasksForScheduling,
  findGapsInWindows,
  timeToMinutes,
  minutesToTime,
  isRigid,
  DAYS_OF_WEEK
} from './utils';
import { totalAvailabilityHours, type Availability } from './availability';

export class HORAScheduler {
  private tasks: Task[];
  private availability: Availability;
  private blocks: ScheduleBlock[] = [];
  private blockCounter: number = 0;

  constructor(tasks: Task[], availability: Availability) {
    this.tasks = tasks;
    this.availability = availability;
  }

  schedule(): WeeklySchedule {
    this.blocks = [];
    this.blockCounter = 0;

    // Step 1: Place all floaters first
    this.placeFloaters();

    // Step 2: Place anchors by priority and load
    this.placeAnchors();

    return {
      weekStartDate: new Date(),
      blocks: this.blocks,
      totalAvailableHours: totalAvailabilityHours(this.availability),
      totalAnchorHours: this.calculateTotalAnchorHours(),
      totalObjectiveHours: this.calculateTotalObjectiveHours(),
    };
  }

  private placeFloaters(): void {
    // Rigid (earth/fire) tasks occur at preset timeslots; place them as floaters
    const rigidTasks = this.tasks.filter(t => !t.completed && isRigid(t.priority));

    for (const task of rigidTasks) {
      for (const slot of task.timeslots || []) {
        const durationMinutes = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
        if (durationMinutes <= 0) continue;

        this.addBlock(task, undefined, slot.day, slot.startTime, slot.endTime, durationMinutes, 'floater');
      }
    }
  }

  private placeAnchors(): void {
    const sortedTasks = sortTasksForScheduling(
      this.tasks.filter(t => !t.completed && !isRigid(t.priority))
    );

    for (const task of sortedTasks) {
      const { days, limitFor } = this.getDeadlineWindow(task);

      // A task is represented by its subobjectives; only a task without any is placed as a whole.
      // Buffer is unscheduled slack, so it is never placed.
      const placeable = task.objectives.filter(o => o.name !== 'Buffer' && !o.completed);
      const items: Array<Objective | undefined> = task.objectives.length === 0 ? [undefined] : placeable;

      for (const objective of items) {
        const hours = objective ? objective.hoursRequired : task.hoursRequired;
        // Anything that doesn't fit before the deadline stays unplaced (in the candidate lane)
        this.placeContinuous(task, objective, days, limitFor, hours * 60);
      }
    }
  }

  // Available days up to the deadline, and how late work may run on each of them
  private getDeadlineWindow(task: Task): { days: string[]; limitFor: (day: string) => number } {
    const [deadlineDay, deadlineTime] = (task.deadline || '').split(' ');
    const deadlineIndex = DAYS_OF_WEEK.indexOf(deadlineDay);

    const days = DAYS_OF_WEEK.filter(
      (day, index) => (this.availability[day]?.length ?? 0) > 0 && (deadlineIndex < 0 || index <= deadlineIndex)
    );
    const limitFor = (day: string) =>
      day === deadlineDay && deadlineTime ? timeToMinutes(deadlineTime) : 24 * 60;

    return { days, limitFor };
  }

  private placeContinuous(
    task: Task,
    objective: Objective | undefined,
    days: string[],
    limitFor: (day: string) => number,
    requiredMinutes: number
  ): boolean {
    for (const day of days) {
      const limit = limitFor(day);

      for (const gap of findGapsInWindows(this.blocks, day, this.availability[day])) {
        const end = Math.min(gap.end, limit);

        if (end - gap.start >= requiredMinutes) {
          this.addBlock(task, objective, day, minutesToTime(gap.start), minutesToTime(gap.start + requiredMinutes), requiredMinutes);
          return true;
        }
      }
    }

    return false;
  }

  private addBlock(
    task: Task,
    objective: Objective | undefined,
    day: string,
    startTime: string,
    endTime: string,
    durationMinutes: number,
    blockType: 'floater' | 'anchor' = 'anchor'
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
      blockType,
      dayOfWeek: day,
      startTime,
      endTime,
      durationMinutes,
      completed: false,
      isSporadic: false,
      description: objective?.description || task.description,
    };

    this.blocks.push(block);
  }

  private calculateTotalAnchorHours(): number {
    return this.blocks.reduce((sum, b) => sum + (b.blockType === 'anchor' ? b.durationMinutes : 0), 0) / 60;
  }

  private calculateTotalObjectiveHours(): number {
    return this.blocks.reduce((sum, b) => sum + (b.blockType === 'anchor' ? b.durationMinutes : 0), 0) / 60;
  }
}

export function scheduleWeek(tasks: Task[], availability: Availability): WeeklySchedule {
  const scheduler = new HORAScheduler(tasks, availability);
  return scheduler.schedule();
}
