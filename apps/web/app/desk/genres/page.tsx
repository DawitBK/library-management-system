import type { Metadata } from 'next';
import { EntityButton } from '@/components/entity-form';
import type { FieldDef } from '@/components/entity-form';
import { ActionButton } from '@/components/form';
import { Empty, PageHeader, Table } from '@/components/ui';
import { api } from '@/lib/server-api';
import type { Genre, Page } from '@/lib/types';

export const metadata: Metadata = { title: 'Genres', robots: { index: false } };

const NAME: FieldDef[] = [{ key: 'name', label: 'Name', required: true, maxLength: 200 }];

export default async function GenresPage() {
  const genres = await api<Page<Genre>>('/genres?limit=100');
  return (
    <>
      <PageHeader
        title="Genres"
        subtitle="A genre that still has books cannot be removed."
        actions={
          <EntityButton
            primary
            label="New genre"
            title="New genre"
            fields={NAME}
            createPath="/genres"
          />
        }
      />
      {genres.items.length === 0 ? (
        <Empty>Add a genre before adding books.</Empty>
      ) : (
        <Table head={['Name', '']}>
          {genres.items.map((g) => (
            <tr key={g.id}>
              <td className="td font-medium">{g.name}</td>
              <td className="td flex justify-end gap-2">
                <EntityButton
                  label="Rename"
                  title={`Rename ${g.name}`}
                  fields={NAME}
                  record={g as unknown as Record<string, unknown> & { version: number }}
                  createPath="/genres"
                  updatePath={`/genres/${g.id}`}
                />
                <ActionButton
                  label="Remove"
                  method="DELETE"
                  path={`/genres/${g.id}`}
                  danger
                  confirm={`Remove ${g.name}?`}
                />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
