import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeBook,
  makeGenre,
  makeMember,
  makeStaff,
  randomIsbn10,
  randomIsbn13,
  startContext,
  type Session,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let librarian: Session;
let genreId: string;

beforeAll(async () => {
  ctx = await startContext();
  librarian = await makeStaff(ctx);
  genreId = await makeGenre(ctx, librarian);
});
afterAll(async () => {
  await ctx.close();
});

describe('the public catalogue', () => {
  it('can be read by anyone and written only by staff', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    expect((await ctx.http().get('/api/v1/genres')).status).toBe(200);
    const read = await ctx.http().get(`/api/v1/books/${book.id}`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ totalCopies: 1, availableCopies: 1 });

    const body = { title: 'Nope', authors: ['A'], genreId };
    expect((await ctx.http().post('/api/v1/books').send(body)).status).toBe(401);
    expect((await ctx.http().post('/api/v1/genres').send({ name: 'Nope' })).status).toBe(401);
    expect((await ctx.http().get(`/api/v1/books/${book.id}/copies`)).status).toBe(401);
  });

  it('searches by title, author and ISBN, and filters by genre and availability', async () => {
    const g = await makeGenre(ctx, librarian);
    const tag = `zq${randomUUID().slice(0, 8)}`;
    const isbn13 = randomIsbn13();
    const a = await makeBook(ctx, librarian, g, {
      title: `${tag} Gamma`,
      authors: ['Chinua Achebe'],
      isbn: isbn13,
    });
    await makeBook(ctx, librarian, g, { title: `${tag} Alpha`, authors: [`Writer ${tag}`] });
    await makeBook(ctx, librarian, g, { title: `${tag} Beta`, authors: ['Someone'], copies: 0 });

    const byTitle = await ctx.http().get(`/api/v1/books?q=${tag}&sort=title`);
    expect(byTitle.body.items.map((b: { title: string }) => b.title)).toEqual([
      `${tag} Alpha`,
      `${tag} Beta`,
      `${tag} Gamma`,
    ]);
    const byAuthor = await ctx.http().get(`/api/v1/books?q=achebe&genreId=${g}`);
    expect(byAuthor.body.items.map((b: { id: string }) => b.id)).toEqual([a.id]);
    const byIsbn = await ctx.http().get(`/api/v1/books?q=${isbn13}`);
    expect(byIsbn.body.items.map((b: { id: string }) => b.id)).toContain(a.id);
    const available = await ctx.http().get(`/api/v1/books?genreId=${g}&availableOnly=true`);
    expect(available.body.page.total).toBe(2);
    const desc = await ctx.http().get(`/api/v1/books?q=${tag}&sort=-title&limit=1`);
    expect(desc.body.items[0].title).toBe(`${tag} Gamma`);
    expect((await ctx.http().get('/api/v1/books?sort=passwordHash')).status).toBe(400);
    expect((await ctx.http().get('/api/v1/books?limit=1000')).status).toBe(400);
  });

  it('treats LIKE wildcards in a search as plain text', async () => {
    const tag = `wc${randomUUID().slice(0, 8)}`;
    await makeBook(ctx, librarian, genreId, { title: `${tag} 100% true` });
    await makeBook(ctx, librarian, genreId, { title: `${tag} 1000 true` });
    const res = await ctx.http().get(`/api/v1/books?q=${tag}%20100%25`);
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual([`${tag} 100% true`]);
  });
});

describe('books', () => {
  it('validates ISBN check digits and normalises them', async () => {
    const make = (isbn: string) =>
      ctx
        .http()
        .post('/api/v1/books')
        .set(librarian.auth)
        .send({ title: `ISBN ${randomUUID()}`, authors: ['A'], genreId, isbn, copies: 0 });
    expect((await make('978-0-385-47454-3')).status).toBe(400); // wrong check digit
    expect((await make('12345')).status).toBe(400);
    const isbn10 = randomIsbn10();
    const ten = await make(isbn10.slice(0, 1) + '-' + isbn10.slice(1));
    expect(ten.status).toBe(201);
    expect(ten.body.isbn).toBe(isbn10);
    const dupe = await make(isbn10);
    expect(dupe.status).toBe(409);
    expect(dupe.body.code).toBe('isbn-taken');
  });

  it('registers copies with unique barcodes and lets staff add more', async () => {
    const book = await makeBook(ctx, librarian, genreId, { copies: 3 });
    const copies = await ctx.http().get(`/api/v1/books/${book.id}/copies`).set(librarian.auth);
    expect(copies.body).toHaveLength(3);
    expect(new Set(copies.body.map((c: { barcode: string }) => c.barcode)).size).toBe(3);
    expect(copies.body[0].barcode).toMatch(/^LB-\d+$/);

    const more = await ctx
      .http()
      .post(`/api/v1/books/${book.id}/copies`)
      .set(librarian.auth)
      .send({ count: 2 });
    expect(more.status).toBe(201);
    expect((await ctx.http().get(`/api/v1/books/${book.id}`)).body.totalCopies).toBe(5);
  });

  it('uses optimistic concurrency and rejects unknown fields', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    const ok = await ctx
      .http()
      .patch(`/api/v1/books/${book.id}`)
      .set(librarian.auth)
      .send({ version: book.version, title: 'Renamed' });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(book.version + 1);
    const stale = await ctx
      .http()
      .patch(`/api/v1/books/${book.id}`)
      .set(librarian.auth)
      .send({ version: book.version, title: 'Late' });
    expect(stale.status).toBe(409);
    const extra = await ctx
      .http()
      .patch(`/api/v1/books/${book.id}`)
      .set(librarian.auth)
      .send({ version: ok.body.version, copies: 99 });
    expect(extra.status).toBe(400);
  });

  it('refuses to delete a book with a copy on loan, then soft-deletes it once returned', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    const member = await makeMember(ctx, librarian);
    const loan = await ctx
      .http()
      .post('/api/v1/loans')
      .set(librarian.auth)
      .send({ memberId: member.id, bookId: book.id });
    expect(loan.status).toBe(201);

    const blocked = await ctx.http().delete(`/api/v1/books/${book.id}`).set(librarian.auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('book-on-loan');

    await ctx.http().post(`/api/v1/loans/${loan.body.id}/return`).set(librarian.auth);
    expect((await ctx.http().delete(`/api/v1/books/${book.id}`).set(librarian.auth)).status).toBe(
      204,
    );
    expect((await ctx.http().get(`/api/v1/books/${book.id}`)).status).toBe(404);
    const { rows } = await ctx.pool.query('select deleted_at from books where id = $1', [book.id]);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('refuses to delete a genre that still has books, and keeps names unique', async () => {
    const g = await makeGenre(ctx, librarian);
    await makeBook(ctx, librarian, g);
    const blocked = await ctx.http().delete(`/api/v1/genres/${g}`).set(librarian.auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('genre-in-use');

    const name = `Unique ${randomUUID().slice(0, 6)}`;
    expect(
      (await ctx.http().post('/api/v1/genres').set(librarian.auth).send({ name })).status,
    ).toBe(201);
    const dupe = await ctx
      .http()
      .post('/api/v1/genres')
      .set(librarian.auth)
      .send({ name: name.toUpperCase() });
    expect(dupe.status).toBe(409);
  });

  it('lets staff mark a copy lost, but never while it is out', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    const copy = (await ctx.http().get(`/api/v1/books/${book.id}/copies`).set(librarian.auth))
      .body[0];
    const lost = await ctx
      .http()
      .patch(`/api/v1/copies/${copy.id}`)
      .set(librarian.auth)
      .send({ version: copy.version, status: 'lost' });
    expect(lost.status).toBe(200);
    expect((await ctx.http().get(`/api/v1/books/${book.id}`)).body.availableCopies).toBe(0);

    const back = await ctx
      .http()
      .patch(`/api/v1/copies/${copy.id}`)
      .set(librarian.auth)
      .send({ version: lost.body.version, status: 'available' });
    expect(back.status).toBe(200);
    const member = await makeMember(ctx, librarian);
    await ctx
      .http()
      .post('/api/v1/loans')
      .set(librarian.auth)
      .send({ memberId: member.id, bookId: book.id });
    const out = await ctx
      .http()
      .patch(`/api/v1/copies/${copy.id}`)
      .set(librarian.auth)
      .send({ version: back.body.version + 1, status: 'lost' });
    expect(out.status).toBe(409);
  });
});
