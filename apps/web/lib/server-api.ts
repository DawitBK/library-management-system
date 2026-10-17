import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, API_URL } from './session';

export interface Problem {
  title?: string;
  detail?: string;
  status?: number;
  errors?: { path?: string; message?: string }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail ?? problem.title ?? `Request failed (${status})`);
  }
}

/** Server-side call to the Library API as the signed-in staff member. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) redirect('/login');
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as Problem;
    throw new ApiError(res.status, problem);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Like api(), but a 403 or 404 becomes null so a page can say "not allowed" instead of crashing. */
export async function apiOrNull<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Every cached public read carries this tag, so a change made through the app refreshes them at once. */
export const CATALOG_TAG = 'catalog';

/** An anonymous read of public catalogue data; cached briefly so a busy page does not hit the API on every view. */
export async function publicApi<T>(path: string, revalidate = 30): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    next: { revalidate, tags: [CATALOG_TAG] },
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as Problem;
    throw new ApiError(res.status, problem);
  }
  return (await res.json()) as T;
}

/** Like publicApi(), but a missing record becomes null so the page can call notFound(). */
export async function publicApiOrNull<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    return await publicApi<T>(path, revalidate);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

/** The signed-in person, or null. Never redirects, so public pages can show "Sign in" or "Account". */
export async function currentUser(): Promise<import('./types').User | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API_URL}/api/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return res.ok ? ((await res.json()) as import('./types').User) : null;
}
