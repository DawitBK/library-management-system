import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { logout } from '@/app/login/actions';
import { DeskNav } from '@/components/desk-nav';
import { currentUser } from '@/lib/server-api';

export default async function DeskLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login?next=%2Fdesk');
  return (
    <div className="min-h-screen md:grid md:grid-cols-[14rem_1fr]">
      <aside className="no-print border-b border-line bg-white p-3 md:min-h-screen md:border-r md:border-b-0">
        <div className="mb-4 px-2">
          <div className="text-base font-semibold tracking-tight">Library desk</div>
          <div className="text-xs text-muted">
            {user.firstName} {user.lastName} · {user.role}
          </div>
        </div>
        <DeskNav admin={user.role === 'admin'} />
        <form action={logout} className="mt-4 px-2">
          <button className="btn w-full">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
