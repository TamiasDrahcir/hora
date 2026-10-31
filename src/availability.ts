// Weekly availability: when you're generally free, e.g. "{MTWRF}0900-1700, {SU}1000-1400"

import { DAY_BY_LETTER } from './taskScript';
import { parseMilitaryInterval, timeToMinutes } from './utils';

export interface TimeWindow {
  start: number; // minutes from midnight
  end: number;
}

export type Availability = Record<string, TimeWindow[]>;

export const DEFAULT_AVAILABILITY = '{MTWRF}0900-1800';

const ENTRY_RE = /^\{([MTWRFSU]+)\}\s*(\d{3,4}\s*-\s*\d{3,4})$/;

function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

export function parseAvailability(text: string): { availability: Availability; errors: string[] } {
  const errors: string[] = [];
  const availability: Availability = {};
  const entries = text.split(/[,;\n]/).map(entry => entry.trim()).filter(Boolean);

  if (entries.length === 0) {
    return { availability, errors: ['Enter at least one window, e.g. {MTWRF}0900-1700'] };
  }

  for (const entry of entries) {
    const match = entry.match(ENTRY_RE);
    if (!match) {
      errors.push(`Cannot parse "${entry}" (expected e.g. {MTWRF}0900-1700)`);
      continue;
    }

    const interval = parseMilitaryInterval(match[2].replace(/\s+/g, ''));
    if (!interval) {
      errors.push(`Invalid interval in "${entry}" (end must be after start)`);
      continue;
    }

    for (const letter of match[1]) {
      const day = DAY_BY_LETTER[letter];
      availability[day] = [
        ...(availability[day] || []),
        { start: timeToMinutes(interval.startTime), end: timeToMinutes(interval.endTime) },
      ];
    }
  }

  for (const day of Object.keys(availability)) {
    availability[day] = mergeWindows(availability[day]);
  }

  return { availability, errors };
}

export function totalAvailabilityHours(availability: Availability): number {
  let minutes = 0;
  for (const windows of Object.values(availability)) {
    for (const window of windows) minutes += window.end - window.start;
  }
  return minutes / 60;
}

// Earliest start and latest end across the week, or null when nothing is configured
export function availabilityRange(availability: Availability): TimeWindow | null {
  const all = Object.values(availability).flat();
  if (all.length === 0) return null;
  return {
    start: Math.min(...all.map(w => w.start)),
    end: Math.max(...all.map(w => w.end)),
  };
}
