import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton, ReasonButton } from '@/components/form';
import { Badge, Empty, PageHeader, Pager, Table, num, statusTone } from '@/components/ui';
import { formatDate, formatMoney, label } from '@/lib/format';
import { api, currentUser, qs } from '@/lib/server-api';
import type { Fine, Member, Page } from '@/lib/types';

export const metadata: Metadata = { title: 'Fines', robots: { index: false } };

export default async function FinesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; memberId?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const status = ['unpaid', 'paid', 'waived'].includes(sp.status ?? '') ? sp.status : 'unpaid';
  const [me, data] = await Promise.all([
    currentUser(),
    api<Page<Fine>>(
      `/fines${qs({ status, memberId: sp.memberId, offset: num(sp.offset), limit: 25 })}`,
    ),
  ]);
  const members = await api<Page<Member>>('/members?limit=100');
  const name = (id: string) => members.items.find((m) => m.id === id)?.name ?? 'Member';
  return (
    <>
      <PageHeader
        title="Fines"
        subtitle="Charged when an overdue book comes back. Only an administrator can waive one."
      />
      <form className="no-print mb-4 flex items-end gap-2" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Show</span>
          <select className="input" name="status" defaultValue={status}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>
      {data.items.length === 0 ? (
        <Empty>No fines.</Empty>
      ) : (
        <Table head={['Member', 'Charged', '>Amount', 'Status', '']}>
          {data.items.map((f) => (
            <tr key={f.id}>
              <td className="td">
                <Link className="hover:underline" href={`/desk/members/${f.memberId}`}>
                  {name(f.memberId)}
                </Link>
              </td>
              <td className="td">{formatDate(f.createdAt)}</td>
              <td className="td text-right tabular-nums">{formatMoney(f.amountMinor)}</td>
              <td className="td">
                <Badge tone={statusTone(f.status)}>{label(f.status)}</Badge>
                {f.waiveReason ? (
                  <span className="ml-2 text-xs text-muted">{f.waiveReason}</span>
                ) : null}
              </td>
              <td className="td text-right">
                {f.status === 'unpaid' ? (
                  <div className="flex justify-end gap-2">
                    <ActionButton
                      label="Mark paid"
                      primary
                      path={`/fines/${f.id}/pay`}
                      confirm="Record this fine as paid?"
                    />
                    {me?.role === 'admin' ? (
                      <ReasonButton
                        label="Waive"
                        title="Waive this fine"
                        path={`/fines/${f.id}/waive`}
                        danger
                      />
                    ) : null}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager
        page={data.page}
        path="/desk/fines"
        params={{ status: sp.status, memberId: sp.memberId }}
      />
    </>
  );
}
