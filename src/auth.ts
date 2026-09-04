import type { LocalUser } from './types';

const USERS_KEY = 'horaUsers';
const SESSION_KEY = 'horaSessionUser';

function readUsers(): LocalUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]') as LocalUser[];
  } catch {
    return [];
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
  if (users.some(user => user.username === normalizedUsername)) throw new Error('That username is already registered.');
  if (normalizedUsername.length < 3) throw new Error('Username must be at least 3 characters.');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  const user: LocalUser = {
    id: crypto.randomUUID(),
    username: normalizedUsername,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export async function signIn(username: string, password: string): Promise<LocalUser> {
  const normalizedUsername = username.trim().toLowerCase();
  const user = readUsers().find(item => item.username === normalizedUsername);
  if (!user || user.passwordHash !== await hashPassword(password)) throw new Error('Username or password is incorrect.');
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY);
}
