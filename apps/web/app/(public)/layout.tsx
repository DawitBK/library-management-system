import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentUser } from '@/lib/server-api';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight text-brand">
            Library
          </Link>
          <form
            action="/"
            method="get"
            role="search"
            className="order-last w-full sm:order-none sm:ml-4 sm:w-auto sm:max-w-md sm:flex-1"
          >
            <input
              className="input"
              type="search"
              name="q"
              placeholder="Search by title, author or ISBN"
              aria-label="Search the catalogue"
              maxLength={100}
            />
          </form>
          <Link className="btn ml-auto" href={user ? '/desk' : '/login'}>
            {user ? 'Staff desk' : 'Staff sign in'}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-line bg-white py-6 text-center text-sm text-muted">
        Ask at the desk to borrow, return or reserve a book.
      </footer>
    </div>
  );
}
