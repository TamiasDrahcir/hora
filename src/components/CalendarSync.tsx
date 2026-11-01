import React, { useMemo, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import type { Task, WeeklySchedule } from '../types';
import { buildCalendarEvents, downloadIcs } from '../calendarEvents';
import { GOOGLE_CALENDAR_URL, googleConfigured } from '../googleCalendar';
import { setAutoSync, syncNow, useGoogleSync } from '../googleSync';

interface CalendarSyncProps {
  schedule: WeeklySchedule;
  tasks: Task[];
}

// Export is for the week on screen; Google sync covers the current and later weeks and is driven by googleSync.ts
const CalendarSync: React.FC<CalendarSyncProps> = ({ schedule, tasks }) => {
  const events = useMemo(() => buildCalendarEvents(schedule, tasks), [schedule, tasks]);
  const sync = useGoogleSync();
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleExport = () => {
    const fileName = downloadIcs(events);
    setExportMessage(`Saved ${fileName}. In Google Calendar open Settings > Import & export > Import to add it.`);
  };

  return (
    <div className="calendar-sync d-flex flex-wrap align-items-center gap-2 mb-2">
      <span className="small fw-semibold">Calendar</span>
      <Button variant="outline-secondary" size="sm" className="btn-stoic" onClick={handleExport} disabled={events.length === 0}>
        Export .ics
      </Button>
      {googleConfigured && (
        <>
          <Button variant="outline-secondary" size="sm" className="btn-stoic" onClick={syncNow} disabled={sync.working}>
            {sync.working ? 'Syncing...' : 'Sync to Google Calendar'}
          </Button>
          <Form.Check
            type="switch"
            id="google-auto-sync"
            label="Auto-sync"
            className="small mb-0"
            title="After your first sync, changes to your schedule are sent to Google Calendar automatically while you're signed in"
            checked={sync.autoSync}
            onChange={event => setAutoSync(event.target.checked)}
          />
        </>
      )}
      {sync.needsSignIn && (
        <small className="text-muted">
          Your Google sign-in has expired, so the latest changes aren't in Google Calendar yet. Press Sync to sign in and update it.
        </small>
      )}
      {sync.outOfDate && !sync.autoSync && !sync.working && (
        <small className="text-muted">The schedule changed since your last sync. Sync again to update Google Calendar.</small>
      )}
      {sync.message && (
        <small className={sync.message.kind === 'ok' ? 'text-success' : 'text-danger'}>
          {sync.message.text}
          {sync.message.kind === 'ok' && (
            <>
              {' '}
              <a href={GOOGLE_CALENDAR_URL} target="_blank" rel="noreferrer">Open Google Calendar</a>
            </>
          )}
        </small>
      )}
      {exportMessage && <small className="text-success">{exportMessage}</small>}
      {!googleConfigured && (
        <small className="text-muted">Google Calendar sync isn't set up for this copy of HORA (see docs/google-calendar.md).</small>
      )}
    </div>
  );
};

export default CalendarSync;
