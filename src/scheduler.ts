// HORA Scheduling Algorithm

import type { Task, ScheduleBlock, WeeklySchedule, Objective } from './types';
import {
  sortTasksForScheduling,
  findGapsInDay,
  timeToMinutes,
  minutesToTime,
  isRigid,
  DAYS_OF_WEEK
} from './utils';

const SCHEDULING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export class HORAScheduler {
  private tasks: Task[];
  private totalAvailableMinutes: number;
  private blocks: ScheduleBlock[] = [];
  private blockCounter: number = 0;

  constructor(tasks: Task[], totalAvailableHours: number) {
    this.tasks = tasks;
    this.totalAvailableMinutes = totalAvailableHours * 60;
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
      totalAvailableHours: this.totalAvailableMinutes / 60,
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
      const { days, lastDayLimit } = this.getDeadlineWindow(task);

      // A task is represented by its subobjectives; only a task without any is placed as a whole.
      // Buffer is unscheduled slack, so it is never placed.
      const placeable = task.objectives.filter(o => o.name !== 'Buffer' && !o.completed);
      const items: Array<Objective | undefined> = task.objectives.length === 0 ? [undefined] : placeable;

      for (const objective of items) {
        const hours = objective ? objective.hoursRequired : task.hoursRequired;
        // Anything that doesn't fit before the deadline stays unplaced (in the candidate lane)
        this.placeContinuous(task, objective, days, lastDayLimit, hours * 60);
      }
    }
  }

  // Days a task may be scheduled on, and how late it may run on the deadline day
  private getDeadlineWindow(task: Task): { days: string[]; lastDayLimit: number } {
    const [deadlineDay, deadlineTime] = (task.deadline || '').split(' ');
    const deadlineIndex = DAYS_OF_WEEK.indexOf(deadlineDay);
    const lastDay = deadlineIndex >= 0 ? Math.min(deadlineIndex, SCHEDULING_DAYS.length - 1) : SCHEDULING_DAYS.length - 1;
    const days = SCHEDULING_DAYS.slice(0, lastDay + 1);

    // Deadlines after Friday still allow all of Monday-Friday up to the end of the day
    const deadlineOnSchedulingDay = deadlineIndex >= 0 && deadlineIndex <= SCHEDULING_DAYS.length - 1;
    const lastDayLimit = deadlineOnSchedulingDay && deadlineTime ? timeToMinutes(deadlineTime) : 24 * 60;
    return { days, lastDayLimit };
  }

  private placeContinuous(
    task: Task,
    objective: Objective | undefined,
    days: string[],
    lastDayLimit: number,
    requiredMinutes: number
  ): boolean {
    for (const day of days) {
      const limit = day === days[days.length - 1] ? lastDayLimit : 24 * 60;

      for (const gap of findGapsInDay(this.blocks, day)) {
        const start = timeToMinutes(gap.start);
        const end = Math.min(timeToMinutes(gap.end), limit);

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

export function scheduleWeek(tasks: Task[], totalAvailableHours: number): WeeklySchedule {
  const scheduler = new HORAScheduler(tasks, totalAvailableHours);
  return scheduler.schedule();
}
