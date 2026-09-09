import type { LocalUser } from './types';

const USERS_KEYS = ['horaUsers', 'hora_users'];
const SESSION_KEY = 'horaSessionUser';

function getUsersStorageKey(): string {
  return USERS_KEYS.find((key) => {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }) || USERS_KEYS[0];
}

function readUsers(): LocalUser[] {
  const key = getUsersStorageKey();
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LocalUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: LocalUser[]): void {
  const key = getUsersStorageKey();
  localStorage.setItem(key, JSON.stringify(users));

  if (key !== 'hora_users') {
    localStorage.setItem('hora_users', JSON.stringify(users));
  }

  if (key !== 'horaUsers') {
    localStorage.setItem('horaUsers', JSON.stringify(users));
  }
}

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function getSessionUser(): LocalUser | null {
  try {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) as LocalUser : null;
  } catch {
    return null;
  }
}

export async function createAccount(username: string, password: string): Promise<LocalUser> {
  const normalizedUsername = username.trim().toLowerCase();
  const users = readUsers();

  if (normalizedUsername.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }

  if (users.some(user => user.username === normalizedUsername)) {
    throw new Error('Username already taken');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const user: LocalUser = {
    id: crypto.randomUUID(),
    username: normalizedUsername,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  writeUsers([...users, user]);
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export async function signIn(username: string, password: string): Promise<LocalUser> {
  const normalizedUsername = username.trim().toLowerCase();
  const user = readUsers().find(item => item.username === normalizedUsername);

  if (!user || user.passwordHash !== await hashPassword(password)) {
    throw new Error('Username or password is incorrect.');
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY);
}
