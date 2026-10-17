import type { Metadata } from 'next';
import Link from 'next/link';
import { Empty, PageHeader, Stat, Table } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { api } from '@/lib/server-api';
import type { Hold, Loan, Page, Summary } from '@/lib/types';

export const metadata: Metadata = { title: 'Desk overview', robots: { index: false } };

export default async function DeskHome() {
  const [summary, overdue, ready] = await Promise.all([
    api<Summary>('/reports/summary'),
    api<Loan[]>('/reports/overdue'),
    api<Page<Hold>>('/holds?status=ready&limit=10'),
  ]);
  return (
    <>
      <PageHeader title="Overview" subtitle="What needs attention at the desk today." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Titles" value={summary.titles} hint={`${summary.copies} copies`} />
        <Stat label="On the shelf" value={summary.availableCopies} />
        <Stat label="On loan" value={summary.openLoans} />
        <Stat
          label="Overdue"
          value={summary.overdueLoans}
          tone={summary.overdueLoans > 0 ? 'bad' : undefined}
        />
        <Stat label="Members" value={summary.members} />
        <Stat
          label="Fines owed"
          value={formatMoney(summary.unpaidFinesMinor)}
          tone={summary.unpaidFinesMinor > 0 ? 'bad' : undefined}
        />
        <Stat label="Holds ready" value={ready.page.total} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Overdue, oldest first</h2>
          {overdue.length === 0 ? (
            <Empty>Nothing is overdue.</Empty>
          ) : (
            <Table head={['Book', 'Member', 'Due', '>Days late']}>
              {overdue.slice(0, 10).map((l) => (
                <tr key={l.id}>
                  <td className="td">{l.bookTitle}</td>
                  <td className="td">
                    <Link className="hover:underline" href={`/desk/members/${l.memberId}`}>
                      {l.memberName}
                    </Link>
                  </td>
                  <td className="td">{formatDate(l.dueAt)}</td>
                  <td className="td text-right tabular-nums text-bad">{l.daysOverdue}</td>
                </tr>
              ))}
            </Table>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Waiting at the desk for pickup</h2>
          {ready.items.length === 0 ? (
            <Empty>No reserved copies are waiting.</Empty>
          ) : (
            <Table head={['Book', 'Member', 'Copy', 'Until']}>
              {ready.items.map((h) => (
                <tr key={h.id}>
                  <td className="td">{h.bookTitle}</td>
                  <td className="td">{h.memberName}</td>
                  <td className="td text-muted">{h.barcode}</td>
                  <td className="td">{formatDate(h.expiresAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
