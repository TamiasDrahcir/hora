// HORA Scheduling Algorithm

import type { Task, ScheduleBlock, WeeklySchedule, Objective } from './types';
import { 
  sortTasksForScheduling, 
  findGapsInDay, 
  timeToMinutes, 
  minutesToTime
} from './utils';

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
    // Place all floater blocks
    // Floaters don't have specific timing in this simplified version
    // In a real app, they would have preset times
  }

  private placeAnchors(): void {
    const sortedTasks = sortTasksForScheduling(this.tasks.filter(t => !t.completed));
    const daysAvailable = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    
    for (const task of sortedTasks) {
      let remainingHours = task.hoursRequired;
      
      // Try to fit entire task as continuous block
      const placed = this.placeTaskContinuous(task, daysAvailable, remainingHours);
      if (placed) continue;
      
      // Otherwise, place with gaps
      this.placeTaskWithGaps(task, daysAvailable, remainingHours);
    }
  }

  private placeTaskContinuous(task: Task, days: string[], hours: number): boolean {
    const requiredMinutes = hours * 60;
    
    for (const day of days) {
      const gaps = findGapsInDay(this.blocks, day);
      
      for (const gap of gaps) {
        if (gap.durationMinutes >= requiredMinutes) {
          const startTime = gap.start;
          const endMinutes = timeToMinutes(gap.start) + requiredMinutes;
          const endTime = minutesToTime(endMinutes);
          
          this.addBlock(
            task,
            undefined,
            day,
            startTime,
            endTime,
            requiredMinutes,
            false
          );
          return true;
        }
      }
    }
    
    return false;
  }

  private placeTaskWithGaps(task: Task, days: string[], hours: number): void {
    let remainingMinutes = hours * 60;
    
    for (const day of days) {
      if (remainingMinutes <= 0) break;
      
      const gaps = findGapsInDay(this.blocks, day);
      
      for (const gap of gaps) {
        if (remainingMinutes <= 0) break;
        
        const minutesToPlace = Math.min(gap.durationMinutes, remainingMinutes);
        const startTime = gap.start;
        const endMinutes = timeToMinutes(gap.start) + minutesToPlace;
        const endTime = minutesToTime(endMinutes);
        
        this.addBlock(
          task,
          undefined,
          day,
          startTime,
          endTime,
          minutesToPlace,
          remainingMinutes > gap.durationMinutes
        );
        
        remainingMinutes -= minutesToPlace;
      }
    }
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

export function scheduleWeek(tasks: Task[], totalAvailableHours: number): WeeklySchedule {
  const scheduler = new HORAScheduler(tasks, totalAvailableHours);
  return scheduler.schedule();
}
