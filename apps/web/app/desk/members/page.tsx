import type { Metadata } from 'next';
import Link from 'next/link';
import { EntityButton } from '@/components/entity-form';
import type { FieldDef } from '@/components/entity-form';
import { Badge, Empty, PageHeader, Pager, Table, num, statusTone } from '@/components/ui';
import { label } from '@/lib/format';
import { api, qs } from '@/lib/server-api';
import type { Member, Page } from '@/lib/types';

export const metadata: Metadata = { title: 'Members', robots: { index: false } };

const MEMBER_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', required: true, maxLength: 200 },
  { key: 'email', label: 'Email', kind: 'email', required: true, maxLength: 254 },
  { key: 'phone', label: 'Phone', maxLength: 20 },
];

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const data = await api<Page<Member>>(
    `/members${qs({ q: sp.q, status: sp.status, offset: num(sp.offset), limit: 25 })}`,
  );
  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${data.page.total} members. A card number is assigned automatically.`}
        actions={
          <EntityButton
            primary
            label="New member"
            title="New member"
            fields={MEMBER_FIELDS}
            createPath="/members"
          />
        }
      />
      <form className="no-print mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Search</span>
          <input className="input" name="q" defaultValue={sp.q} placeholder="Name, email or card" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Status</span>
          <select className="input" name="status" defaultValue={sp.status ?? ''}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>
      {data.items.length === 0 ? (
        <Empty>No members match.</Empty>
      ) : (
        <Table head={['Name', 'Card', 'Contact', 'Status']}>
          {data.items.map((m) => (
            <tr key={m.id} className="hover:bg-surface">
              <td className="td font-medium">
                <Link className="hover:underline" href={`/desk/members/${m.id}`}>
                  {m.name}
                </Link>
              </td>
              <td className="td text-muted">{m.cardNumber}</td>
              <td className="td text-muted">{[m.email, m.phone].filter(Boolean).join(' · ')}</td>
              <td className="td">
                <Badge tone={statusTone(m.status)}>{label(m.status)}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={data.page} path="/desk/members" params={{ q: sp.q, status: sp.status }} />
    </>
  );
}
