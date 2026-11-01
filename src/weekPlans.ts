// Per-week plans: each week has its own task script, available hours, compiled tasks and schedule.

import type { AppState, WeekPlan } from './types';
import { DEFAULT_AVAILABILITY } from './availability';
import { tasksToScript } from './taskScript';
import { weekKeyOf } from './utils';

export function emptyPlan(availability: string = DEFAULT_AVAILABILITY): WeekPlan {
  return { scriptText: '', availability, tasks: [], schedule: null };
}

// A week with nothing planned yet starts from the available hours of the nearest earlier planned week
// (or the latest planned week when there is none), so hours don't have to be re-entered every week.
export function defaultAvailabilityFor(weeks: Record<string, WeekPlan>, key: string): string {
  const keys = Object.keys(weeks).sort();
  const earlier = keys.filter(k => k < key);
  const source = earlier.length > 0 ? earlier[earlier.length - 1] : keys[keys.length - 1];
  return (source && weeks[source]?.availability) || DEFAULT_AVAILABILITY;
}

export function planFor(weeks: Record<string, WeekPlan>, key: string): WeekPlan {
  return weeks[key] ?? emptyPlan(defaultAvailabilityFor(weeks, key));
}

// The script that is (or would be) open in the editor for a plan
export function planScript(plan: WeekPlan): string {
  return plan.scriptText || (plan.tasks.length > 0 ? tasksToScript(plan.tasks) : '');
}

export function hasContent(plan: WeekPlan | undefined): boolean {
  return !!plan && (planScript(plan).trim() !== '' || plan.schedule !== null);
}

// Rebuilds app state from storage. Earlier versions kept a single plan; it becomes the plan for its own week.
export function restoreState(saved: Record<string, any>): Partial<AppState> {
  // discordWebhook is a leftover from a removed feature and was a secret, so it is dropped here
  const {
    discordWebhook: _legacyWebhook,
    tasks,
    schedule,
    availability,
    scriptText,
    currentWeekStartDate: _legacyWeek,
    selectedWeek: _selected,
    weeks: savedWeeks,
    ...rest
  } = saved;

  const weeks: Record<string, WeekPlan> = savedWeeks && typeof savedWeeks === 'object' ? { ...savedWeeks } : {};
  let selectedWeek = weekKeyOf();

  if (!savedWeeks) {
    const hasLegacyPlan =
      (Array.isArray(tasks) && tasks.length > 0) ||
      !!schedule ||
      !!scriptText ||
      (typeof availability === 'string' && availability !== DEFAULT_AVAILABILITY);
    if (hasLegacyPlan) {
      const key = schedule ? weekKeyOf(new Date(schedule.weekStartDate)) : weekKeyOf();
      weeks[key] = {
        scriptText: scriptText || '',
        availability: availability || DEFAULT_AVAILABILITY,
        tasks: Array.isArray(tasks) ? tasks : [],
        schedule: schedule || null,
      };
      selectedWeek = key;
    }
  }

  return {
    ...rest,
    weeks,
    selectedWeek,
    templates: Array.isArray(rest.templates) ? rest.templates : [],
    // The Schedule view no longer exists; older saved state may still point at it
    currentView: rest.currentView === 'schedule' ? 'setup' : rest.currentView,
  };
}
