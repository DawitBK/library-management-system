'use client';

import { useActionState } from 'react';
import { Notice } from '@/components/ui';
import type { AuthState } from './actions';

export function AuthForm({
  action,
  next,
}: {
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, run, pending] = useActionState<AuthState, FormData>(action, {});
  return (
    <form action={run} className="card space-y-4 p-5">
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      {state.error ? <Notice tone="bad">{state.error}</Notice> : null}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
