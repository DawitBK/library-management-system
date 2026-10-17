'use server';

import { cookies, headers } from 'next/headers';
import { forwardedFor } from '@/lib/client-ip';
import { redirect } from 'next/navigation';
import {
  ACCESS_COOKIE,
  API_URL,
  REFRESH_COOKIE,
  accessCookie,
  refreshCookie,
  type TokenPair,
} from '@/lib/session';

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Only same-site paths: a "next" parameter must never send someone to another website. */
function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === 'string' ? value : '';
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/desk';
}

async function start(
  path: string,
  payload: unknown,
): Promise<{ tokens?: TokenPair; state?: AuthState }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/auth/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...forwardedFor(await headers()) },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return { state: { error: 'The server cannot be reached. Try again in a moment.' } };
  }
  if (res.status === 401) return { state: { error: 'That email and password do not match.' } };
  if (res.status === 429) {
    return { state: { error: 'Too many attempts. Wait a minute and try again.' } };
  }
  if (res.status === 400) {
    const problem = (await res.json().catch(() => ({}))) as {
      errors?: { path?: string; message?: string }[];
    };
    const fieldErrors: Record<string, string> = {};
    for (const e of problem.errors ?? []) if (e.path && e.message) fieldErrors[e.path] = e.message;
    return { state: { error: 'Please correct the highlighted fields.', fieldErrors } };
  }
  if (!res.ok) return { state: { error: 'Something went wrong. Try again.' } };
  return { tokens: (await res.json()) as TokenPair };
}

async function finish(tokens: TokenPair, next: string): Promise<never> {
  const jar = await cookies();
  jar.set(accessCookie(tokens));
  jar.set(refreshCookie(tokens));
  redirect(next);
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };
  const { tokens, state } = await start('login', { email, password });
  if (!tokens) return state ?? {};
  return finish(tokens, safeNext(form.get('next')));
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...forwardedFor(await headers()) },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect('/');
}
