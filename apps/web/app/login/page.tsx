import type { Metadata } from 'next';
import Link from 'next/link';
import { ssoConfig } from '@/lib/sso';
import { login } from './actions';
import { AuthForm } from './auth-form';

export const metadata: Metadata = { title: 'Staff sign in', robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const sso = await ssoConfig();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Staff sign in</h1>
      <p className="mb-5 text-sm text-muted">
        For library staff. Members do not need an account:{' '}
        <Link className="text-brand hover:underline" href="/">
          search the catalogue
        </Link>
        .
      </p>
      <AuthForm action={login} next={next} />
      {sso.enabled ? (
        <a
          className="btn mt-3 w-full text-center"
          href={`/login/sso${next ? `?next=${encodeURIComponent(next)}` : ''}`}
        >
          Sign in with SSO
        </a>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error === 'no-account'
            ? 'Your single sign-on account has no access here. Ask an administrator to add you.'
            : 'Single sign-on did not complete. Try again.'}
        </p>
      ) : null}
    </main>
  );
}
