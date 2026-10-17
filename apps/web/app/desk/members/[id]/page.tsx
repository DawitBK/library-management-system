import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntityButton } from '@/components/entity-form';
import type { FieldDef } from '@/components/entity-form';
import { ActionButton } from '@/components/form';
import { Badge, Empty, PageHeader, Stat, Table, statusTone } from '@/components/ui';
import { formatDate, formatMoney, label } from '@/lib/format';
import { api, apiOrNull } from '@/lib/server-api';
import type { Fine, Hold, Loan, MemberDetail, Page } from '@/lib/types';
import { DeleteMember } from './delete-member';

export const metadata: Metadata = { title: 'Member', robots: { index: false } };

const EDIT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', required: true, maxLength: 200 },
  { key: 'email', label: 'Email', kind: 'email', required: true, maxLength: 254 },
  { key: 'phone', label: 'Phone', maxLength: 20 },
  {
    key: 'status',
    label: 'Status',
    kind: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'suspended', label: 'Suspended (cannot borrow or hold)' },
    ],
  },
];

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await apiOrNull<MemberDetail>(`/members/${id}`);
  if (!member) notFound();
  const [loans, fines, holds] = await Promise.all([
    api<Page<Loan>>(`/loans?memberId=${id}&limit=25`),
    api<Page<Fine>>(`/fines?memberId=${id}&limit=25`),
    api<Page<Hold>>(`/holds?memberId=${id}&limit=25`),
  ]);

  return (
    <>
      <PageHeader
        title={member.name}
        subtitle={`${member.cardNumber} · ${member.email}${member.phone ? ` · ${member.phone}` : ''}`}
        actions={
          <>
            <Badge tone={statusTone(member.status)}>{label(member.status)}</Badge>
            <EntityButton
              label="Edit"
              title={`Edit ${member.name}`}
              fields={EDIT_FIELDS}
              record={member as unknown as Record<string, unknown> & { version: number }}
              createPath="/members"
              updatePath={`/members/${member.id}`}
            />
            <DeleteMember memberId={member.id} />
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="On loan" value={member.openLoans} />
        <Stat
          label="Fines owed"
          value={formatMoney(member.unpaidFinesMinor)}
          tone={member.unpaidFinesMinor > 0 ? 'bad' : undefined}
        />
        <Stat label="Member since" value={formatDate(member.createdAt)} />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Loans</h2>
        {loans.items.length === 0 ? (
          <Empty>No loans yet.</Empty>
        ) : (
          <Table head={['Book', 'Borrowed', 'Due', 'Status', '']}>
            {loans.items.map((l) => (
              <tr key={l.id}>
                <td className="td font-medium">{l.bookTitle}</td>
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
      </section>

      {fines.items.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">
            Fines{' '}
            <Link
              className="ml-2 text-xs font-normal text-brand hover:underline"
              href={`/desk/fines?memberId=${id}&status=unpaid`}
            >
              manage
            </Link>
          </h2>
          <Table head={['Charged', '>Amount', 'Status']}>
            {fines.items.map((f) => (
              <tr key={f.id}>
                <td className="td">{formatDate(f.createdAt)}</td>
                <td className="td text-right tabular-nums">{formatMoney(f.amountMinor)}</td>
                <td className="td">
                  <Badge tone={statusTone(f.status)}>{label(f.status)}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}

      {holds.items.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Holds</h2>
          <Table head={['Book', 'Status', 'Place', 'Until']}>
            {holds.items.map((h) => (
              <tr key={h.id}>
                <td className="td font-medium">{h.bookTitle}</td>
                <td className="td">
                  <Badge tone={statusTone(h.status)}>{label(h.status)}</Badge>
                </td>
                <td className="td tabular-nums">{h.queuePosition ?? '–'}</td>
                <td className="td">{h.expiresAt ? formatDate(h.expiresAt) : '–'}</td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
    </>
  );
}
