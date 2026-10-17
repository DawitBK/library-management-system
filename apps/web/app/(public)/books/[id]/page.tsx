import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui';
import { publicApiOrNull } from '@/lib/server-api';
import type { Book } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  return UUID.test(id) ? publicApiOrNull<Book>(`/books/${id}`) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const book = await load((await params).id);
  if (!book) return { title: 'Book not found', robots: { index: false } };
  const description = (
    book.description ?? `${book.title} by ${book.authors.join(', ')}. ${book.genreName}.`
  ).slice(0, 160);
  return {
    title: `${book.title} by ${book.authors.join(', ')}`,
    description,
    alternates: { canonical: `/books/${book.id}` },
    openGraph: { title: book.title, description, type: 'book' },
  };
}

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const book = await load((await params).id);
  if (!book) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: book.authors.map((name) => ({ '@type': 'Person', name })),
    ...(book.isbn ? { isbn: book.isbn } : {}),
    ...(book.publishedYear ? { datePublished: String(book.publishedYear) } : {}),
    genre: book.genreName,
    ...(book.description ? { description: book.description } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link className="hover:underline" href="/">
          Catalogue
        </Link>{' '}
        / {book.genreName}
      </nav>
      <h1 className="text-2xl font-semibold tracking-tight">{book.title}</h1>
      <p className="mt-1 text-muted">{book.authors.join(', ')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge>{book.genreName}</Badge>
        {book.publishedYear ? <Badge>{book.publishedYear}</Badge> : null}
        {book.isbn ? <Badge>ISBN {book.isbn}</Badge> : null}
      </div>
      <section aria-label="Availability" className="card mt-5 p-4">
        {book.availableCopies > 0 ? (
          <p className="text-good">
            {book.availableCopies} of {book.totalCopies} cop{book.totalCopies === 1 ? 'y' : 'ies'}{' '}
            on the shelf now. Ask at the desk to borrow it.
          </p>
        ) : book.totalCopies > 0 ? (
          <p className="text-warn">
            All {book.totalCopies} cop{book.totalCopies === 1 ? 'y is' : 'ies are'} out. Ask at the
            desk to reserve it; you will be told when it is ready.
          </p>
        ) : (
          <p className="text-bad">This title has no copies in circulation.</p>
        )}
      </section>
      {book.description ? (
        <div className="mt-5 max-w-prose whitespace-pre-line text-sm leading-relaxed">
          {book.description}
        </div>
      ) : null}
    </>
  );
}
