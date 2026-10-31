// HORA task script parser & serializer
//
// Script format (one block per task):
//   TaskName (SECTION-CODE) [!] [* | YYMMDD]
//     !      = important flag
//     *      = recurring
//     YYMMDD = recurring until date
//
//   Flexible body:
//     REQ <hours> BY <day><time>      e.g. REQ 5 BY F2359 (BY defaults to F2359)
//     <SubobjectiveName> : <hours>    optional; defaults to hour-long Subobj1..N
//                                     (unassigned hours become Buffer)
//   Rigid body (fixed timeslots):
//     {<days>}<interval>              e.g. {MWF}1020-1110
//
//   Days: M T W R F S U (Monday..Sunday). Times are military (e.g. 2230).
//   Lines starting with # are comments.

import { v4 as uuidv4 } from 'uuid';
import type { Task, Objective, TimeSlot } from './types';
import { parseMilitaryInterval, formatMilitaryInterval, isRigid } from './utils';

export interface ScriptError {
  line: number; // 1-based, 0 when not tied to a line
  message: string;
}

export interface ParseResult {
  tasks: Task[];
  errors: ScriptError[];
}

export const DAY_BY_LETTER: Record<string, string> = {
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  R: 'Thursday',
  F: 'Friday',
  S: 'Saturday',
  U: 'Sunday',
};

const LETTER_BY_DAY: Record<string, string> = Object.fromEntries(
  Object.entries(DAY_BY_LETTER).map(([letter, day]) => [day, letter])
);

const HEADER_RE = /^(.*\S)\s*\(\s*([A-Za-z0-9]{1,7})\s*-\s*([A-Za-z0-9]{1,4})\s*\)\s*(.*)$/;
const RIGID_RE = /^\{([MTWRFSU]+)\}\s*(\d{3,4}\s*-\s*\d{3,4})$/;
const REQ_RE = /^REQ\s+(\d+(?:\.\d+)?)(?:\s+BY\s+([MTWRFSU])(\d{4}))?\s*$/i;
const SUBOBJ_RE = /^(.*\S)\s*:\s*(\d+(?:\.\d+)?)\s*$/;
const DATE_RE = /^\d{6}$/;

interface DraftTask {
  line: number;
  name: string;
  code: string;
  important: boolean;
  recurring: boolean;
  recurrenceEnd?: string;
  req?: number;
  deadlineDay?: string;
  deadlineTime?: string;
  subobjs: Array<{ name: string; hours: number; line: number }>;
  slots: Array<{ day: string; startTime: string; endTime: string }>;
}

function parseDate(raw: string): string | null {
  const year = 2000 + parseInt(raw.slice(0, 2), 10);
  const month = parseInt(raw.slice(2, 4), 10);
  const day = parseInt(raw.slice(4, 6), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatMilitaryTime(time: string): string {
  return time.replace(':', '');
}

function militaryToTime(raw: string): string {
  return `${raw.slice(0, 2)}:${raw.slice(2)}`;
}

export function parseTaskScript(script: string, existingTasks: Task[] = []): ParseResult {
  const lines = script.split(/\r?\n/);
  const errors: ScriptError[] = [];
  const tasks: Task[] = [];
  const seenCodes = new Set<string>();
  let draft: DraftTask | null = null;

  const finalize = () => {
    if (!draft) return;
    const d = draft;
    draft = null;

    const isFlexible = d.req !== undefined;
    const hasSlots = d.slots.length > 0;

    if (isFlexible && hasSlots) {
      errors.push({ line: d.line, message: `"${d.name}": a task cannot mix REQ with {days} timeslots.` });
      return;
    }
    if (!isFlexible && !hasSlots) {
      errors.push({ line: d.line, message: `"${d.name}": needs a REQ line (flexible) or {days} timeslot lines (rigid).` });
      return;
    }
    if (seenCodes.has(d.code)) {
      errors.push({ line: d.line, message: `Duplicate task code ${d.code}.` });
      return;
    }
    seenCodes.add(d.code);

    const prev = existingTasks.find(t => t.code === d.code);

    if (hasSlots) {
      // Rigid task: earth if important, fire otherwise
      tasks.push({
        id: prev?.id || uuidv4(),
        code: d.code,
        name: d.name,
        hoursRequired: 0,
        deadline: '',
        priority: d.important ? 'earth' : 'fire',
        objectives: [],
        completed: prev?.completed || false,
        recurring: d.recurring,
        recurrenceEnd: d.recurrenceEnd,
        timeslots: d.slots.map(s => ({ id: uuidv4(), day: s.day, startTime: s.startTime, endTime: s.endTime })),
      });
      return;
    }

    // Flexible task: water if important, air otherwise
    const req = d.req as number;
    if (req <= 0) {
      errors.push({ line: d.line, message: `"${d.name}": REQ hours must be positive.` });
      return;
    }

    let subobjs = d.subobjs;
    if (subobjs.length === 0) {
      // Default: hour-long subobjectives Subobj1..N (+ remainder)
      subobjs = [];
      const whole = Math.floor(req);
      for (let i = 1; i <= whole; i++) subobjs.push({ name: `Subobj${i}`, hours: 1, line: d.line });
      const remainder = req - whole;
      if (remainder > 0) subobjs.push({ name: `Subobj${whole + 1}`, hours: remainder, line: d.line });
    }

    const subTotal = subobjs.reduce((sum, s) => sum + s.hours, 0);
    if (subTotal > req) {
      errors.push({ line: d.line, message: `"${d.name}": subobjectives total ${subTotal}h, more than REQ ${req}h.` });
      return;
    }
    // Unassigned hours become buffer
    if (subTotal < req) {
      subobjs = [...subobjs, { name: 'Buffer', hours: req - subTotal, line: d.line }];
    }

    const objectives: Objective[] = subobjs.map(s => {
      const prevObj = prev?.objectives.find(o => o.name === s.name);
      return {
        id: prevObj?.id || uuidv4(),
        code: `${d.code}-${s.name.replace(/\s+/g, '').toUpperCase().slice(0, 8)}`,
        name: s.name,
        hoursRequired: s.hours,
        completed: prevObj?.completed || false,
        completedAt: prevObj?.completedAt,
      };
    });

    const deadlineDay = d.deadlineDay || 'Friday';
    const deadlineTime = d.deadlineTime || '23:59';

    tasks.push({
      id: prev?.id || uuidv4(),
      code: d.code,
      name: d.name,
      hoursRequired: req,
      deadline: `${deadlineDay} ${deadlineTime}`,
      priority: d.important ? 'water' : 'air',
      objectives,
      completed: prev?.completed || false,
      recurring: d.recurring,
      recurrenceEnd: d.recurrenceEnd,
      timeslots: [],
    });
  };

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    // Header line?
    const header = line.match(HEADER_RE);
    if (header) {
      finalize();
      const [, name, section, taskCode, flagsRaw] = header;
      const next: DraftTask = {
        line: lineNo,
        name: name.trim(),
        code: `${section.toUpperCase()}-${taskCode.toUpperCase()}`,
        important: false,
        recurring: false,
        subobjs: [],
        slots: [],
      };
      for (const flag of flagsRaw.split(/\s+/).filter(Boolean)) {
        if (flag === '!') {
          next.important = true;
        } else if (flag === '*') {
          next.recurring = true;
        } else if (DATE_RE.test(flag)) {
          const date = parseDate(flag);
          if (!date) {
            errors.push({ line: lineNo, message: `Invalid date "${flag}" (expected YMD, e.g. 261231).` });
          } else {
            next.recurring = true;
            next.recurrenceEnd = date;
          }
        } else {
          errors.push({ line: lineNo, message: `Unknown flag "${flag}" (expected ! , * or YYMMDD).` });
        }
      }
      draft = next;
      return;
    }

    if (!draft) {
      errors.push({ line: lineNo, message: `Expected a task header like: TaskName (SECTION-CODE)` });
      return;
    }

    // Rigid timeslot line?
    const rigid = line.match(RIGID_RE);
    if (rigid) {
      const [, dayLetters, intervalRaw] = rigid;
      const interval = parseMilitaryInterval(intervalRaw.replace(/\s+/g, ''));
      if (!interval) {
        errors.push({ line: lineNo, message: `Invalid interval "${intervalRaw}" (expected e.g. 1020-1110, end after start).` });
        return;
      }
      for (const letter of dayLetters) {
        draft.slots.push({ day: DAY_BY_LETTER[letter], ...interval });
      }
      return;
    }

    // REQ line?
    const req = line.match(REQ_RE);
    if (req) {
      if (draft.req !== undefined) {
        errors.push({ line: lineNo, message: `Duplicate REQ line.` });
        return;
      }
      draft.req = parseFloat(req[1]);
      if (req[2]) {
        const time = req[3];
        const hours = parseInt(time.slice(0, 2), 10);
        const minutes = parseInt(time.slice(2), 10);
        if (hours > 23 || minutes > 59) {
          errors.push({ line: lineNo, message: `Invalid deadline time "${time}".` });
        } else {
          draft.deadlineDay = DAY_BY_LETTER[req[2].toUpperCase()];
          draft.deadlineTime = militaryToTime(time);
        }
      }
      return;
    }

    // Subobjective line?
    const sub = line.match(SUBOBJ_RE);
    if (sub) {
      if (draft.req === undefined) {
        errors.push({ line: lineNo, message: `Subobjective before REQ line (rigid tasks cannot have subobjectives).` });
        return;
      }
      draft.subobjs.push({ name: sub[1].trim(), hours: parseFloat(sub[2]), line: lineNo });
      return;
    }

    errors.push({ line: lineNo, message: `Cannot parse: "${line}"` });
  });

  finalize();
  return { tasks, errors };
}

// Serialize tasks back into script form (used to prefill the editor)
export function tasksToScript(tasks: Task[]): string {
  const blocks = tasks.map(task => {
    const important = task.priority === 'earth' || task.priority === 'water';
    const flags: string[] = [];
    if (important) flags.push('!');
    if (task.recurrenceEnd) flags.push(task.recurrenceEnd.replace(/-/g, '').slice(2));
    else if (task.recurring) flags.push('*');

    const lines = [`${task.name} (${task.code})${flags.length ? ' ' + flags.join(' ') : ''}`];

    if (isRigid(task.priority)) {
      // Group timeslots sharing the same interval, days in MTWRFSU order
      const byInterval = new Map<string, TimeSlot[]>();
      for (const slot of task.timeslots || []) {
        const key = formatMilitaryInterval(slot.startTime, slot.endTime);
        byInterval.set(key, [...(byInterval.get(key) || []), slot]);
      }
      const dayOrder = Object.values(DAY_BY_LETTER);
      for (const [interval, slots] of byInterval) {
        const letters = slots
          .map(s => s.day)
          .sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
          .map(day => LETTER_BY_DAY[day])
          .join('');
        lines.push(`{${letters}}${interval}`);
      }
    } else {
      const [dayName, time] = task.deadline.split(' ');
      const letter = LETTER_BY_DAY[dayName] || 'F';
      const military = time ? formatMilitaryTime(time) : '2359';
      lines.push(`REQ ${task.hoursRequired} BY ${letter}${military}`);
      for (const obj of task.objectives) {
        if (obj.name === 'Buffer') continue; // buffer is derived
        lines.push(`${obj.name} : ${obj.hoursRequired}`);
      }
    }
    return lines.join('\n');
  });

  return blocks.join('\n\n');
}
