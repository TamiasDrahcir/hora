// Google Calendar sync, entirely in the browser.
//
// The user signs in with Google (Google Identity Services) and HORA writes the schedule into its own
// secondary calendar named "HORA". The narrow calendar.app.created permission lets HORA manage only
// calendars it created, so it can never read or change the user's other events.
// Each sync wipes the HORA events from the current week onward and then adds the up-to-date batch.
// Needs VITE_GOOGLE_CLIENT_ID (see docs/google-calendar.md); without it the Google button is hidden.

import { REMINDER_MINUTES, type CalendarEvent } from './calendarEvents';
import type { Priority } from './types';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const CALENDAR_ID_KEY = 'horaGoogleCalendarId';
const CALENDAR_NAME = 'HORA';
const CALENDAR_DESCRIPTION = 'Schedule synced from HORA';
const MAX_PARALLEL_REQUESTS = 5;

export const googleConfigured = Boolean(CLIENT_ID);
export const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r/week';

export interface GoogleSyncResult {
  deleted: number;
  created: number;
  total: number;
}

// Google Calendar color ids that sit closest to each element's color in HORA
const COLOR_IDS: Record<Priority, string> = {
  earth: '6', // Tangerine
  water: '9', // Blueberry
  fire: '11', // Tomato
  air: '7', // Peacock
};

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

// A failure with a message that is safe to show as-is
export class GoogleCalendarError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.status = status;
  }
}

let gisLoading: Promise<void> | null = null;

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisLoading = null;
        reject(new GoogleCalendarError("Couldn't load Google sign-in. Check your connection or any content blocker."));
      };
      document.head.appendChild(script);
    });
  }
  return gisLoading;
}

let token: { value: string; expiresAt: number } | null = null;

// A token lasts about an hour, so syncs within that time need no new sign-in
export function hasGoogleToken(): boolean {
  return token !== null && Date.now() < token.expiresAt - 60_000;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && token && hasGoogleToken()) return token.value;

  await loadGoogleIdentity();
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw new GoogleCalendarError("Google sign-in isn't available.");

  return new Promise<string>((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: response => {
        if (response.error || !response.access_token) {
          reject(new GoogleCalendarError(response.error_description || 'Google sign-in was not completed.'));
          return;
        }
        token = { value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 };
        resolve(token.value);
      },
      error_callback: error => {
        reject(
          new GoogleCalendarError(
            error.type === 'popup_closed'
              ? 'The Google sign-in window was closed before finishing.'
              : error.type === 'popup_failed_to_open'
                ? 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
                : error.message || 'Google sign-in failed.'
          )
        );
      },
    });
    client.requestAccessToken();
  });
}

// Turns Google's error response into something a person can act on
async function toError(response: Response): Promise<GoogleCalendarError> {
  const body = await response.json().catch(() => null);
  const detail = body?.error;
  const reason: string = detail?.errors?.[0]?.reason || '';
  const message: string = detail?.message || response.statusText;

  if (reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(message)) {
    return new GoogleCalendarError(
      'The Google Calendar API is not enabled for your Google Cloud project. Enable it under APIs & Services > Library > Google Calendar API.',
      response.status
    );
  }
  if (response.status === 403) {
    return new GoogleCalendarError(`Google refused access (${message}). Try signing in again.`, response.status);
  }
  if (response.status === 429 || response.status >= 500) {
    return new GoogleCalendarError('Google Calendar is busy right now. Try again in a moment.', response.status);
  }
  return new GoogleCalendarError(`Google Calendar answered ${response.status}: ${message}`, response.status);
}

type Call = (path: string, init?: RequestInit) => Promise<unknown>;

// Runs requests with the current token, signing in again once if Google says it has expired
function makeCaller(initialToken: string): Call {
  let current = initialToken;

  const send = (path: string, init: RequestInit = {}) =>
    fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${current}`, 'Content-Type': 'application/json', ...init.headers },
    });

  return async (path, init) => {
    let response = await send(path, init);
    if (response.status === 401) {
      token = null;
      current = await getAccessToken(true);
      response = await send(path, init);
    }
    // Writing many events quickly can hit Google's rate limits; back off and retry a few times
    for (let attempt = 0; !response.ok && attempt < RETRY_DELAYS_MS.length && (await isRetryable(response)); attempt++) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      response = await send(path, init);
    }
    if (!response.ok) throw await toError(response);
    return response.status === 204 ? null : response.json();
  };
}

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

async function isRetryable(response: Response): Promise<boolean> {
  if (response.status === 429 || response.status >= 500) return true;
  if (response.status !== 403) return false;
  return /rateLimitExceeded|userRateLimitExceeded/.test(await response.clone().text().catch(() => ''));
}

// Runs the worker over the items a few at a time; after a failure nothing new is started, so a failed
// sync can't keep writing in the background while the next one begins
async function runLimited<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL_REQUESTS, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined && !failed; item = queue.shift()) {
        try {
          await worker(item);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    })
  );
}

const timeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

// RFC 3339 with the local UTC offset, e.g. 2026-11-02T09:00:00-06:00
function rfc3339(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  );
}

function eventPayload(event: CalendarEvent) {
  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: rfc3339(event.start), timeZone: timeZone() },
    end: { dateTime: rfc3339(event.end), timeZone: timeZone() },
    colorId: COLOR_IDS[event.priority],
    reminders: {
      useDefault: false,
      overrides: event.remind ? [{ method: 'popup', minutes: REMINDER_MINUTES }] : [],
    },
    // Marks the event as HORA's, so a sync can find and remove exactly what HORA put there
    extendedProperties: { private: { hora: '1', horaWeek: event.weekKey } },
  };
}

// HORA's own calendar, found again by its description if the saved id was lost (e.g. site data cleared),
// so a second "HORA" calendar isn't created
async function findExistingCalendar(call: Call): Promise<string | null> {
  try {
    const list = (await call('/users/me/calendarList?minAccessRole=owner&fields=items(id,summary,description)')) as {
      items?: Array<{ id: string; summary?: string; description?: string }>;
    };
    return list.items?.find(c => c.summary === CALENDAR_NAME && c.description === CALENDAR_DESCRIPTION)?.id ?? null;
  } catch {
    return null;
  }
}

async function ensureCalendar(call: Call): Promise<string> {
  const saved = localStorage.getItem(CALENDAR_ID_KEY);
  if (saved) {
    try {
      await call(`/calendars/${encodeURIComponent(saved)}`);
      return saved;
    } catch (error) {
      // Deleted in Google Calendar: fall through and make a fresh one
      if (!(error instanceof GoogleCalendarError) || (error.status !== 404 && error.status !== 410)) throw error;
    }
  }

  const found = await findExistingCalendar(call);
  if (found) {
    localStorage.setItem(CALENDAR_ID_KEY, found);
    return found;
  }

  const created = (await call('/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: CALENDAR_NAME, description: CALENDAR_DESCRIPTION, timeZone: timeZone() }),
  })) as { id: string };
  localStorage.setItem(CALENDAR_ID_KEY, created.id);
  return created.id;
}

// Every event HORA has put on the calendar that starts at or after `from`
async function listHoraEventIds(call: Call, calendarId: string, from: Date): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({
      privateExtendedProperty: 'hora=1',
      timeMin: from.toISOString(),
      showDeleted: 'false',
      maxResults: '250',
      fields: 'nextPageToken,items(id)',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = (await call(`/calendars/${encodeURIComponent(calendarId)}/events?${query}`)) as {
      items?: Array<{ id: string }>;
      nextPageToken?: string;
    };
    ids.push(...(page.items ?? []).map(item => item.id));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return ids;
}

// Replaces what HORA has on Google Calendar from `from` onward: first every HORA event from that moment
// is deleted, and only then is the up-to-date batch added, so repeated syncs can never pile up duplicates.
// Earlier events (past weeks) are left alone as history.
export async function syncToGoogleCalendar(events: CalendarEvent[], from: Date): Promise<GoogleSyncResult> {
  if (!googleConfigured) throw new GoogleCalendarError('Google Calendar sync is not set up for this copy of HORA.');

  const call = makeCaller(await getAccessToken());
  const calendarId = await ensureCalendar(call);
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  const result: GoogleSyncResult = { deleted: 0, created: 0, total: events.length };

  // 1. Wipe. If this fails nothing is added, so a failed sync can't leave two copies behind.
  await runLimited(await listHoraEventIds(call, calendarId, from), async id => {
    try {
      await call(`${base}/${id}`, { method: 'DELETE' });
      result.deleted++;
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || (error.status !== 404 && error.status !== 410)) throw error;
    }
  });

  // 2. Add the current batch
  await runLimited(events, async event => {
    await call(base, { method: 'POST', body: JSON.stringify(eventPayload(event)) });
    result.created++;
  });

  return result;
}
