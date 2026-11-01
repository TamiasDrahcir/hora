import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import type { Task, WeeklySchedule } from '../types';
import { buildCalendarEvents, downloadIcs, scheduleWeekKey } from '../calendarEvents';
import {
  GOOGLE_CALENDAR_URL,
  googleConfigured,
  hasGoogleToken,
  syncToGoogleCalendar,
} from '../googleCalendar';

interface CalendarSyncProps {
  schedule: WeeklySchedule;
  tasks: Task[];
}

const SYNCED_SIGNATURE_KEY = 'horaGoogleSyncSignature';

type Message = { kind: 'ok' | 'error'; text: string; link?: boolean };

const CalendarSync: React.FC<CalendarSyncProps> = ({ schedule, tasks }) => {
  const events = useMemo(() => buildCalendarEvents(schedule, tasks), [schedule, tasks]);
  const weekKey = scheduleWeekKey(schedule);

  // What the calendar would contain; compared with the last sync to spot unsynced changes
  const signature = useMemo(
    () => JSON.stringify(events.map(e => [e.uid, e.summary, e.start.getTime(), e.end.getTime(), e.remind])),
    [events]
  );

  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [syncedSignature, setSyncedSignature] = useState(() => localStorage.getItem(SYNCED_SIGNATURE_KEY));
  const autoAttempted = useRef<string | null>(null);

  const handleExport = () => {
    const fileName = downloadIcs(events);
    setMessage({
      kind: 'ok',
      text: `Saved ${fileName}. In Google Calendar open Settings > Import & export > Import to add it.`,
    });
  };

  const sync = async (automatic = false) => {
    setWorking(true);
    if (!automatic) setMessage(null);
    try {
      const result = await syncToGoogleCalendar(events, weekKey);
      localStorage.setItem(SYNCED_SIGNATURE_KEY, signature);
      setSyncedSignature(signature);
      setMessage({
        kind: 'ok',
        text: `${automatic ? 'Updated Google Calendar' : 'Synced'}: ${result.total} event${result.total !== 1 ? 's' : ''} (${result.created} added, ${result.updated} updated, ${result.deleted} removed).`,
        link: true,
      });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setWorking(false);
    }
  };

  // After a first sync, keep the calendar current as the schedule changes, while the Google sign-in is still valid.
  // Each version of the schedule is tried once so a failing sync can't loop.
  useEffect(() => {
    if (!googleConfigured || working || !syncedSignature || signature === syncedSignature) return;
    if (!hasGoogleToken() || autoAttempted.current === signature) return;

    autoAttempted.current = signature;
    const timer = setTimeout(() => sync(true), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, syncedSignature, working]);

  const outOfDate = googleConfigured && syncedSignature !== null && syncedSignature !== signature && !working;

  return (
    <div className="calendar-sync d-flex flex-wrap align-items-center gap-2 mb-2">
      <span className="small fw-semibold">Calendar</span>
      <Button variant="outline-secondary" size="sm" className="btn-stoic" onClick={handleExport} disabled={events.length === 0}>
        Export .ics
      </Button>
      {googleConfigured && (
        <Button variant="outline-secondary" size="sm" className="btn-stoic" onClick={() => sync()} disabled={working}>
          {working ? 'Syncing...' : 'Sync to Google Calendar'}
        </Button>
      )}
      {outOfDate && !message && (
        <small className="text-muted">The schedule changed since your last sync. Sync again to update Google Calendar.</small>
      )}
      {message && (
        <small className={message.kind === 'ok' ? 'text-success' : 'text-danger'}>
          {message.text}
          {message.link && (
            <>
              {' '}
              <a href={GOOGLE_CALENDAR_URL} target="_blank" rel="noreferrer">Open Google Calendar</a>
            </>
          )}
        </small>
      )}
      {!googleConfigured && (
        <small className="text-muted">Google Calendar sync isn't set up for this copy of HORA (see docs/google-calendar.md).</small>
      )}
    </div>
  );
};

export default CalendarSync;
