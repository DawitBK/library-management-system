import type { Metadata } from 'next';
import { ActionButton } from '@/components/form';
import { Badge, Empty, PageHeader, Pager, Table, num, statusTone } from '@/components/ui';
import { formatDate, label } from '@/lib/format';
import { api, qs } from '@/lib/server-api';
import type { Book, Hold, Member, Page } from '@/lib/types';
import { PlaceHold } from './place-hold';

export const metadata: Metadata = { title: 'Holds', robots: { index: false } };

export default async function HoldsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const status = ['waiting', 'ready', 'fulfilled', 'cancelled', 'expired'].includes(sp.status ?? '')
    ? sp.status
    : undefined;
  const [data, members, books] = await Promise.all([
    api<Page<Hold>>(`/holds${qs({ status, offset: num(sp.offset), limit: 25 })}`),
    api<Page<Member>>('/members?limit=100&status=active'),
    api<Page<Book>>('/books?limit=100'),
  ]);
  const full = books.items.filter((b) => b.totalCopies > 0 && b.availableCopies === 0);
  return (
    <>
      <PageHeader
        title="Holds"
        subtitle="A queue per book. A returned copy is set aside for whoever has waited longest."
        actions={
          <>
            <ActionButton label="Expire overdue holds" path="/holds/process" />
            <PlaceHold
              members={members.items.map((m) => ({
                id: m.id,
                label: `${m.name} (${m.cardNumber})`,
              }))}
              books={full.map((b) => ({ id: b.id, label: b.title }))}
            />
          </>
        }
      />
      <form className="no-print mb-4 flex items-end gap-2" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Show</span>
          <select className="input" name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {['waiting', 'ready', 'fulfilled', 'cancelled', 'expired'].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>
      {data.items.length === 0 ? (
        <Empty>No holds.</Empty>
      ) : (
        <Table head={['Book', 'Member', 'Status', 'Place', 'Copy', 'Until', '']}>
          {data.items.map((h) => (
            <tr key={h.id}>
              <td className="td font-medium">{h.bookTitle}</td>
              <td className="td">{h.memberName}</td>
              <td className="td">
                <Badge tone={statusTone(h.status)}>{label(h.status)}</Badge>
              </td>
              <td className="td tabular-nums">{h.queuePosition ?? '–'}</td>
              <td className="td text-muted">{h.barcode ?? '–'}</td>
              <td className="td">{h.expiresAt ? formatDate(h.expiresAt) : '–'}</td>
              <td className="td text-right">
                {h.status === 'waiting' || h.status === 'ready' ? (
                  <ActionButton
                    label="Cancel"
                    danger
                    path={`/holds/${h.id}/cancel`}
                    confirm="Cancel this hold?"
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={data.page} path="/desk/holds" params={{ status }} />
    </>
  );
}
