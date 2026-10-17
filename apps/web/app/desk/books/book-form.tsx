'use client';

import { useState } from 'react';
import { Field, Modal, useMutation } from '@/components/form';
import { Notice } from '@/components/ui';
import type { Book, Genre } from '@/lib/types';

function BookForm({ genres, book, onDone }: { genres: Genre[]; book?: Book; onDone: () => void }) {
  const [f, setF] = useState({
    title: book?.title ?? '',
    authors: book?.authors.join(', ') ?? '',
    isbn: book?.isbn ?? '',
    year: book?.publishedYear ? String(book.publishedYear) : '',
    genreId: book?.genreId ?? genres[0]?.id ?? '',
    description: book?.description ?? '',
    copies: '1',
  });
  const m = useMutation();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const authors = f.authors
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  const year = f.year.trim() ? Number(f.year) : null;
  const yearBad = year !== null && (!Number.isInteger(year) || year < 1000 || year > 2100);
  const valid = f.title.trim() !== '' && authors.length > 0 && f.genreId !== '' && !yearBad;

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        const r = book
          ? await m.run('PATCH', `/books/${book.id}`, {
              version: book.version,
              title: f.title.trim(),
              authors,
              isbn: f.isbn.trim() || null,
              publishedYear: year,
              genreId: f.genreId,
              description: f.description.trim() || null,
            })
          : await m.run('POST', '/books', {
              title: f.title.trim(),
              authors,
              ...(f.isbn.trim() ? { isbn: f.isbn.trim() } : {}),
              ...(year !== null ? { publishedYear: year } : {}),
              genreId: f.genreId,
              ...(f.description.trim() ? { description: f.description.trim() } : {}),
              copies: Number(f.copies) || 0,
            });
        if (r.ok) onDone();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" error={m.fieldErrors['title']}>
            <input
              className="input"
              value={f.title}
              onChange={set('title')}
              required
              maxLength={200}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Authors"
            hint="Separate several authors with commas"
            error={m.fieldErrors['authors']}
          >
            <input className="input" value={f.authors} onChange={set('authors')} required />
          </Field>
        </div>
        <Field
          label="ISBN"
          hint="10 or 13 digits; the check digit is verified"
          error={m.fieldErrors['isbn']}
        >
          <input className="input" value={f.isbn} onChange={set('isbn')} />
        </Field>
        <Field
          label="Year published"
          error={yearBad ? 'A year between 1000 and 2100' : m.fieldErrors['publishedYear']}
        >
          <input className="input" inputMode="numeric" value={f.year} onChange={set('year')} />
        </Field>
        <Field label="Genre" error={m.fieldErrors['genreId']}>
          <select className="input" value={f.genreId} onChange={set('genreId')} required>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        {!book ? (
          <Field label="Copies to register" error={m.fieldErrors['copies']}>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={f.copies}
              onChange={set('copies')}
            />
          </Field>
        ) : null}
      </div>
      <Field label="Description" error={m.fieldErrors['description']}>
        <textarea
          className="input min-h-24 py-2"
          value={f.description}
          onChange={set('description')}
          maxLength={5000}
        />
      </Field>
      {m.error ? <Notice tone="bad">{m.error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={m.busy || !valid}>
          {book ? 'Save changes' : 'Add book'}
        </button>
      </div>
    </form>
  );
}

export function NewBook({ genres }: { genres: Genre[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => setOpen(true)}
        disabled={genres.length === 0}
      >
        Add a book
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a book" wide>
        <BookForm genres={genres} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditBook({ book, genres }: { book: Book; genres: Genre[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Edit details
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Edit ${book.title}`} wide>
        <BookForm book={book} genres={genres} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
