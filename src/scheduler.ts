// HORA Scheduling Algorithm

import type { Task, ScheduleBlock, WeeklySchedule, Objective } from './types';
import {
  sortTasksForScheduling,
  findGapsInWindows,
  timeToMinutes,
  minutesToTime,
  isRigid,
  taskWindowOnDay,
  DAYS_OF_WEEK
} from './utils';
import { totalAvailabilityHours, type Availability } from './availability';
import { planningWeekStart } from './revenue';

export class HORAScheduler {
  private tasks: Task[];
  private availability: Availability;
  private weekStart: Date;
  private blocks: ScheduleBlock[] = [];
  private blockCounter: number = 0;

  constructor(tasks: Task[], availability: Availability, weekStart: Date = planningWeekStart(new Date())) {
    this.tasks = tasks;
    this.availability = availability;
    this.weekStart = weekStart;
  }

  schedule(): WeeklySchedule {
    this.blocks = [];
    this.blockCounter = 0;

    // Step 1: Place all floaters first
    this.placeFloaters();

    // Step 2: Place anchors by priority and load
    this.placeAnchors();

    return {
      weekStartDate: this.weekStart,
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
      // A task is represented by its subobjectives; only a task without any is placed as a whole.
      // Buffer is unscheduled slack, so it is never placed.
      const placeable = task.objectives.filter(o => o.name !== 'Buffer' && !o.completed);
      const items: Array<Objective | undefined> = task.objectives.length === 0 ? [undefined] : placeable;

      for (const objective of items) {
        const hours = objective ? objective.hoursRequired : task.hoursRequired;
        // Anything that doesn't fit inside the FROM..BY window stays unplaced (in the candidate lane)
        this.placeContinuous(task, objective, hours * 60);
      }
    }
  }

  private placeContinuous(task: Task, objective: Objective | undefined, requiredMinutes: number): boolean {
    for (const day of DAYS_OF_WEEK) {
      const span = taskWindowOnDay(task, day);
      if (!span || !this.availability[day]?.length) continue;

      for (const gap of findGapsInWindows(this.blocks, day, this.availability[day])) {
        const start = Math.max(gap.start, span.start);
        const end = Math.min(gap.end, span.end);

        if (end - start >= requiredMinutes) {
          this.addBlock(task, objective, day, minutesToTime(start), minutesToTime(start + requiredMinutes), requiredMinutes);
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

export function scheduleWeek(tasks: Task[], availability: Availability, weekStart?: Date): WeeklySchedule {
  const scheduler = new HORAScheduler(tasks, availability, weekStart);
  return scheduler.schedule();
}
