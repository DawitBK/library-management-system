import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/form';
import { Badge, Empty, PageHeader, Stat, Table, statusTone } from '@/components/ui';
import { formatDate, label } from '@/lib/format';
import { api, apiOrNull } from '@/lib/server-api';
import type { Book, Copy, Genre, Hold, Page } from '@/lib/types';
import { EditBook } from '../book-form';
import { CopyActions } from './copy-actions';
import { DeleteBook } from './delete-book';

export const metadata: Metadata = { title: 'Book', robots: { index: false } };

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await apiOrNull<Book>(`/books/${id}`);
  if (!book) notFound();
  const [copies, holds, genres] = await Promise.all([
    api<Copy[]>(`/books/${id}/copies`),
    api<Page<Hold>>(`/holds?bookId=${id}&limit=50`),
    api<Page<Genre>>('/genres?limit=100'),
  ]);
  const live = holds.items.filter((h) => h.status === 'waiting' || h.status === 'ready');

  return (
    <>
      <PageHeader
        title={book.title}
        subtitle={`${book.authors.join(', ')}${book.isbn ? ` · ISBN ${book.isbn}` : ''}`}
        actions={
          <>
            <EditBook book={book} genres={genres.items} />
            <DeleteBook bookId={book.id} />
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Genre" value={book.genreName} />
        <Stat label="Copies" value={book.totalCopies} />
        <Stat
          label="On the shelf"
          value={book.availableCopies}
          tone={book.availableCopies === 0 ? 'bad' : undefined}
        />
        <Stat label="Waiting to borrow" value={live.length} />
      </div>
      {book.description ? (
        <p className="mb-6 max-w-prose text-sm text-muted">{book.description}</p>
      ) : null}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Copies</h2>
          <ActionButton label="Add one copy" path={`/books/${id}/copies`} body={{ count: 1 }} />
        </div>
        {copies.length === 0 ? (
          <Empty>No copies registered.</Empty>
        ) : (
          <Table head={['Barcode', 'Status', '']}>
            {copies.map((c) => (
              <tr key={c.id}>
                <td className="td font-mono text-sm">{c.barcode}</td>
                <td className="td">
                  <Badge tone={statusTone(c.status)}>{label(c.status)}</Badge>
                </td>
                <td className="td text-right">
                  <CopyActions copy={c} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Hold queue</h2>
        {live.length === 0 ? (
          <Empty>Nobody is waiting for this book.</Empty>
        ) : (
          <Table head={['Place', 'Member', 'Status', 'Copy', 'Until']}>
            {live.map((h) => (
              <tr key={h.id}>
                <td className="td tabular-nums">{h.queuePosition ?? 'Ready'}</td>
                <td className="td">{h.memberName}</td>
                <td className="td">
                  <Badge tone={statusTone(h.status)}>{label(h.status)}</Badge>
                </td>
                <td className="td text-muted">{h.barcode ?? '–'}</td>
                <td className="td">{h.expiresAt ? formatDate(h.expiresAt) : '–'}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </>
  );
}
