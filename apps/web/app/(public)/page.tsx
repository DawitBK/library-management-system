import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Empty, Pager, num } from '@/components/ui';
import { publicApi, qs } from '@/lib/server-api';
import type { Book, Genre, Page } from '@/lib/types';

type Search = { q?: string; genreId?: string; available?: string; offset?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = Boolean(sp.q || sp.genreId || sp.available || sp.offset);
  return {
    title: sp.q ? `Search: ${sp.q}` : 'Library catalogue',
    alternates: { canonical: '/' },
    // Result pages are for people; the books themselves are what search engines should list.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [genres, data] = await Promise.all([
    publicApi<Page<Genre>>('/genres?limit=100', 120),
    publicApi<Page<Book>>(
      `/books${qs({
        q: sp.q,
        genreId: sp.genreId,
        availableOnly: sp.available === 'true' ? 'true' : undefined,
        offset: num(sp.offset),
        limit: 12,
      })}`,
    ),
  ]);

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {sp.q ? `Results for “${sp.q}”` : 'Library catalogue'}
      </h1>
      <p className="mb-5 text-sm text-muted">
        {data.page.total} title{data.page.total === 1 ? '' : 's'}
      </p>
      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        {sp.q ? <input type="hidden" name="q" value={sp.q} /> : null}
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Genre</span>
          <select className="input" name="genreId" defaultValue={sp.genreId ?? ''}>
            <option value="">All genres</option>
            {genres.items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="available"
            value="true"
            defaultChecked={sp.available === 'true'}
          />
          On the shelf now
        </label>
        <button className="btn btn-primary">Apply</button>
      </form>
      {data.items.length === 0 ? (
        <Empty>No books match. Try different words or fewer filters.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.items.map((b) => (
            <li key={b.id}>
              <Link href={`/books/${b.id}`} className="card block h-full p-4 hover:border-brand">
                <h2 className="font-medium">{b.title}</h2>
                <p className="mt-0.5 text-sm text-muted">
                  {b.authors.join(', ')}
                  {b.publishedYear ? ` · ${b.publishedYear}` : ''}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge>{b.genreName}</Badge>
                  {b.availableCopies > 0 ? (
                    <Badge tone="good">
                      {b.availableCopies} of {b.totalCopies} on the shelf
                    </Badge>
                  ) : b.totalCopies > 0 ? (
                    <Badge tone="warn">All copies out</Badge>
                  ) : (
                    <Badge tone="bad">Not available</Badge>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager
        page={data.page}
        path="/"
        params={{ q: sp.q, genreId: sp.genreId, available: sp.available }}
      />
    </>
  );
}
