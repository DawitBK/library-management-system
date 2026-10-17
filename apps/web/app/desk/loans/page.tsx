import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/form';
import { Badge, Empty, PageHeader, Pager, Table, num } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { api, qs } from '@/lib/server-api';
import type { Loan, Page } from '@/lib/types';

export const metadata: Metadata = { title: 'Loans', robots: { index: false } };

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; barcode?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const status = ['open', 'returned', 'overdue'].includes(sp.status ?? '') ? sp.status : 'open';
  const data = await api<Page<Loan>>(
    `/loans${qs({ status, barcode: sp.barcode, offset: num(sp.offset), limit: 25 })}`,
  );
  return (
    <>
      <PageHeader title="Loans" subtitle={`${data.page.total} ${status}`} />
      <form className="no-print mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Show</span>
          <select className="input" name="status" defaultValue={status}>
            <option value="open">On loan</option>
            <option value="overdue">Overdue</option>
            <option value="returned">Returned</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Barcode</span>
          <input
            className="input"
            name="barcode"
            defaultValue={sp.barcode}
            placeholder="Copy barcode"
          />
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>
      {data.items.length === 0 ? (
        <Empty>No loans.</Empty>
      ) : (
        <Table head={['Book', 'Copy', 'Member', 'Borrowed', 'Due', 'Status', '']}>
          {data.items.map((l) => (
            <tr key={l.id}>
              <td className="td font-medium">{l.bookTitle}</td>
              <td className="td text-muted">{l.barcode}</td>
              <td className="td">
                <Link className="hover:underline" href={`/desk/members/${l.memberId}`}>
                  {l.memberName}
                </Link>
              </td>
              <td className="td">{formatDate(l.borrowedAt)}</td>
              <td className="td">{formatDate(l.dueAt)}</td>
              <td className="td">
                {l.returnedAt ? (
                  <Badge tone="good">Returned {formatDate(l.returnedAt)}</Badge>
                ) : l.overdue ? (
                  <Badge tone="bad">{l.daysOverdue} days late</Badge>
                ) : (
                  <Badge tone="info">On loan</Badge>
                )}
              </td>
              <td className="td text-right">
                {!l.returnedAt ? (
                  <div className="flex justify-end gap-2">
                    {!l.overdue ? (
                      <ActionButton label="Renew" path={`/loans/${l.id}/renew`} />
                    ) : null}
                    <ActionButton label="Return" primary path={`/loans/${l.id}/return`} />
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager
        page={data.page}
        path="/desk/loans"
        params={{ status: sp.status, barcode: sp.barcode }}
      />
    </>
  );
}
