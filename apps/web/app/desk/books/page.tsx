import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Empty, PageHeader, Pager, Table, num } from '@/components/ui';
import { api, qs } from '@/lib/server-api';
import type { Book, Genre, Page } from '@/lib/types';
import { NewBook } from './book-form';

export const metadata: Metadata = { title: 'Books', robots: { index: false } };

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genreId?: string; offset?: string }>;
}) {
  const sp = await searchParams;
  const [data, genres] = await Promise.all([
    api<Page<Book>>(
      `/books${qs({ q: sp.q, genreId: sp.genreId, offset: num(sp.offset), limit: 25 })}`,
    ),
    api<Page<Genre>>('/genres?limit=100'),
  ]);
  return (
    <>
      <PageHeader
        title="Books"
        subtitle={`${data.page.total} titles`}
        actions={<NewBook genres={genres.items} />}
      />
      <form className="no-print mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Search</span>
          <input
            className="input"
            name="q"
            defaultValue={sp.q}
            placeholder="Title, author or ISBN"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Genre</span>
          <select className="input" name="genreId" defaultValue={sp.genreId ?? ''}>
            <option value="">All</option>
            {genres.items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>
      {data.items.length === 0 ? (
        <Empty>No books match.</Empty>
      ) : (
        <Table head={['Title', 'Authors', 'Genre', '>On shelf', '>Copies']}>
          {data.items.map((b) => (
            <tr key={b.id} className="hover:bg-surface">
              <td className="td font-medium">
                <Link className="hover:underline" href={`/desk/books/${b.id}`}>
                  {b.title}
                </Link>
              </td>
              <td className="td text-muted">{b.authors.join(', ')}</td>
              <td className="td">
                <Badge>{b.genreName}</Badge>
              </td>
              <td
                className={`td text-right tabular-nums ${b.availableCopies === 0 ? 'text-bad' : ''}`}
              >
                {b.availableCopies}
              </td>
              <td className="td text-right tabular-nums">{b.totalCopies}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={data.page} path="/desk/books" params={{ q: sp.q, genreId: sp.genreId }} />
    </>
  );
}
