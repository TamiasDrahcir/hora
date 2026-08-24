// Type definitions for HORA system

export type Priority = 'earth' | 'water' | 'fire' | 'air';
export type BlockType = 'floater' | 'anchor';
export type AdjustmentType = 'mothball' | 'loan' | 'abandon' | 'add';

export interface Objective {
  id: string;
  code: string; // e.g., "POLS206-PB10-QX"
  name: string;
  hoursRequired: number;
  description?: string;
  completed: boolean;
  completedAt?: Date;
}

export interface Task {
  id: string;
  code: string; // e.g., "POLS206-PB10"
  name: string;
  hoursRequired: number;
  description?: string;
  deadline: string; // day of week
  objectives: Objective[];
  priority: Priority;
  completed: boolean;
}

export interface ScheduleBlock {
  id: string;
  taskId: string;
  taskCode: string;
  taskName: string;
  objectiveId?: string;
  objectiveCode?: string;
  objectiveName?: string;
  priority: Priority;
  blockType: BlockType;
  dayOfWeek: string; // Monday, Tuesday, etc.
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  completed: boolean;
  completedAt?: Date;
  isSporadic: boolean;
  description?: string;
}

export interface WeeklySchedule {
  weekStartDate: Date;
  blocks: ScheduleBlock[];
  totalAvailableHours: number;
  totalAnchorHours: number;
  totalObjectiveHours: number;
}

export interface WeeklyReport {
  weekStartDate: Date;
  totalScheduledLoad: number; // hours
  totalScheduledLoadPercentage: number;
  totalPlannedLoad: number; // hours
  totalPlannedLoadPercentage: number;
  loadByPriority: {
    earth: { hours: number; percentage: number };
    water: { hours: number; percentage: number };
    fire: { hours: number; percentage: number };
    air: { hours: number; percentage: number };
  };
  overallBalance: number; // minutes
  perHourBalance: Array<{ hour: number; balance: number }>;
  adjustments: Array<{
    type: AdjustmentType;
    timestamp: Date;
    details: string;
  }>;
}

export interface AppState {
  tasks: Task[];
  schedule: WeeklySchedule | null;
  report: WeeklyReport | null;
  currentView: 'setup' | 'schedule' | 'execution' | 'report' | 'adjustments';
  availableHoursPerDay: number;
  currentWeekStartDate: Date;
}
