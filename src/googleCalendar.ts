// Google Calendar sync, entirely in the browser.
//
// The user signs in with Google (Google Identity Services) and HORA writes the schedule into its own
// secondary calendar named "HORA". The narrow calendar.app.created permission lets HORA manage only
// calendars it created, so it can never read or change the user's other events.
// Needs VITE_GOOGLE_CLIENT_ID (see docs/google-calendar.md); without it the Google button is hidden.

import { REMINDER_MINUTES, type CalendarEvent } from './calendarEvents';
import type { Priority } from './types';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const CALENDAR_ID_KEY = 'horaGoogleCalendarId';
const MAX_PARALLEL_REQUESTS = 5;

export const googleConfigured = Boolean(CLIENT_ID);
export const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r/week';

export interface GoogleSyncResult {
  created: number;
  updated: number;
  deleted: number;
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
    if (!response.ok) throw await toError(response);
    return response.status === 204 ? null : response.json();
  };
}

async function runLimited<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL_REQUESTS, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item);
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

// Google event ids must be 5-1024 chars of a-v and 0-9; a hash of the block's uid keeps it stable
async function googleEventId(uid: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `hora${hex.slice(0, 32)}`;
}

function eventPayload(id: string, event: CalendarEvent) {
  return {
    id,
    summary: event.summary,
    description: event.description,
    start: { dateTime: rfc3339(event.start), timeZone: timeZone() },
    end: { dateTime: rfc3339(event.end), timeZone: timeZone() },
    colorId: COLOR_IDS[event.priority],
    reminders: {
      useDefault: false,
      overrides: event.remind ? [{ method: 'popup', minutes: REMINDER_MINUTES }] : [],
    },
    extendedProperties: { private: { hora: '1', horaWeek: event.weekKey } },
  };
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

  const created = (await call('/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: 'HORA', description: 'Schedule synced from HORA', timeZone: timeZone() }),
  })) as { id: string };
  localStorage.setItem(CALENDAR_ID_KEY, created.id);
  return created.id;
}

async function listWeekEventIds(call: Call, calendarId: string, weekKey: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({
      privateExtendedProperty: `horaWeek=${weekKey}`,
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

// Makes the HORA calendar show exactly this week's events: new blocks are added, changed ones updated,
// and events for blocks that are no longer on the schedule are removed
export async function syncToGoogleCalendar(events: CalendarEvent[], weekKey: string): Promise<GoogleSyncResult> {
  if (!googleConfigured) throw new GoogleCalendarError('Google Calendar sync is not set up for this copy of HORA.');

  const call = makeCaller(await getAccessToken());
  const calendarId = await ensureCalendar(call);
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;

  const existing = new Set(await listWeekEventIds(call, calendarId, weekKey));
  const desired = await Promise.all(
    events.map(async event => {
      const id = await googleEventId(event.uid);
      return { id, payload: eventPayload(id, event) };
    })
  );
  const wanted = new Set(desired.map(item => item.id));

  const result: GoogleSyncResult = { created: 0, updated: 0, deleted: 0, total: desired.length };

  await runLimited(desired, async ({ id, payload }) => {
    const update = () => call(`${base}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

    if (existing.has(id)) {
      await update();
      result.updated++;
      return;
    }
    try {
      await call(base, { method: 'POST', body: JSON.stringify(payload) });
      result.created++;
    } catch (error) {
      // 409: the id is taken by an event deleted earlier; updating it brings it back
      if (error instanceof GoogleCalendarError && error.status === 409) {
        await update();
        result.updated++;
      } else {
        throw error;
      }
    }
  });

  await runLimited([...existing].filter(id => !wanted.has(id)), async id => {
    try {
      await call(`${base}/${id}`, { method: 'DELETE' });
      result.deleted++;
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || (error.status !== 404 && error.status !== 410)) throw error;
    }
  });

  return result;
}
