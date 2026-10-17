import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeBook,
  makeGenre,
  makeMember,
  makeStaff,
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

const lend = (memberId: string, body: Record<string, unknown>) =>
  ctx
    .http()
    .post('/api/v1/loans')
    .set(librarian.auth)
    .send({ memberId, ...body });
const hold = (memberId: string, bookId: string) =>
  ctx.http().post('/api/v1/holds').set(librarian.auth).send({ memberId, bookId });
const getHold = async (id: string) =>
  (await ctx.http().get(`/api/v1/holds/${id}`).set(librarian.auth)).body;
const giveBack = (loanId: string) =>
  ctx.http().post(`/api/v1/loans/${loanId}/return`).set(librarian.auth);
const copiesOf = async (bookId: string) =>
  (await ctx.http().get(`/api/v1/books/${bookId}/copies`).set(librarian.auth)).body as {
    id: string;
    barcode: string;
    status: string;
    version: number;
  }[];

/** A one-copy book that is out on loan to a member, ready for others to queue behind. */
async function bookOnLoan(copies = 1) {
  const book = await makeBook(ctx, librarian, genreId, { copies });
  const holder = await makeMember(ctx, librarian);
  const loans = [];
  for (let i = 0; i < copies; i += 1) {
    const r = await lend(holder.id, { bookId: book.id });
    expect(r.status).toBe(201);
    loans.push(r.body);
  }
  return { book, holder, loans };
}

describe('placing a hold', () => {
  it('queues members in order and reports each place', async () => {
    const { book } = await bookOnLoan();
    const [a, b, c] = await Promise.all([
      makeMember(ctx, librarian),
      makeMember(ctx, librarian),
      makeMember(ctx, librarian),
    ]);
    const first = await hold(a.id, book.id);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: 'waiting', queuePosition: 1, barcode: null });
    const second = await hold(b.id, book.id);
    const third = await hold(c.id, book.id);
    expect(second.body.queuePosition).toBe(2);
    expect(third.body.queuePosition).toBe(3);

    const list = await ctx
      .http()
      .get(`/api/v1/holds?bookId=${book.id}&status=waiting`)
      .set(librarian.auth);
    expect(list.body.page.total).toBe(3);
  });

  it('refuses a hold while a copy is on the shelf', async () => {
    const book = await makeBook(ctx, librarian, genreId, { copies: 1 });
    const member = await makeMember(ctx, librarian);
    const r = await hold(member.id, book.id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('copy-available');
  });

  it('refuses a duplicate, a book the member already has, a suspended member and a book with no copies', async () => {
    const { book, holder } = await bookOnLoan();
    const waiting = await makeMember(ctx, librarian);
    expect((await hold(waiting.id, book.id)).status).toBe(201);
    const again = await hold(waiting.id, book.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('hold-exists');

    const own = await hold(holder.id, book.id);
    expect(own.body.code).toBe('already-borrowed');

    const suspended = await makeMember(ctx, librarian, 'suspended');
    expect((await hold(suspended.id, book.id)).body.code).toBe('member-suspended');

    const lost = await makeBook(ctx, librarian, genreId, { copies: 1 });
    const [copy] = await copiesOf(lost.id);
    await ctx
      .http()
      .patch(`/api/v1/copies/${copy!.id}`)
      .set(librarian.auth)
      .send({ version: copy!.version, status: 'lost' });
    expect((await hold(waiting.id, lost.id)).body.code).toBe('no-copies');
  });

  it('limits how many holds one member may have', async () => {
    const member = await makeMember(ctx, librarian);
    for (let i = 0; i < 5; i += 1) {
      const { book } = await bookOnLoan();
      expect((await hold(member.id, book.id)).status).toBe(201);
    }
    const { book } = await bookOnLoan();
    const r = await hold(member.id, book.id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('hold-limit');
  });
});

describe('a returned copy goes to the next in line', () => {
  it('sets the copy aside for the oldest hold and keeps everyone else waiting', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const b = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    const holdB = (await hold(b.id, book.id)).body;

    expect((await giveBack(loans[0].id)).status).toBe(200);

    const readyA = await getHold(holdA.id);
    expect(readyA).toMatchObject({ status: 'ready', queuePosition: null });
    expect(readyA.barcode).toBe(loans[0].barcode);
    const days =
      (new Date(readyA.expiresAt).getTime() - new Date(readyA.readyAt).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(3);
    expect((await getHold(holdB.id)).queuePosition).toBe(1);

    const copies = await copiesOf(book.id);
    expect(copies[0]!.status).toBe('held');
    expect((await ctx.http().get(`/api/v1/books/${book.id}`)).body.availableCopies).toBe(0);
  });

  it('lets only the member it is held for take it, by barcode or by book', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const stranger = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    await giveBack(loans[0].id);

    const byBarcode = await lend(stranger.id, { barcode: loans[0].barcode });
    expect(byBarcode.status).toBe(409);
    expect(byBarcode.body.code).toBe('copy-held');
    const byBook = await lend(stranger.id, { bookId: book.id });
    expect(byBook.status).toBe(409);
    expect(byBook.body.code).toBe('no-copy-available');

    const taken = await lend(a.id, { bookId: book.id });
    expect(taken.status).toBe(201);
    expect(taken.body.barcode).toBe(loans[0].barcode);
    const closed = await getHold(holdA.id);
    expect(closed).toMatchObject({ status: 'fulfilled', fulfilledLoanId: taken.body.id });
    expect((await copiesOf(book.id))[0]!.status).toBe('on_loan');
  });

  it('lets the holder take it by barcode too', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    await giveBack(loans[0].id);
    const r = await lend(a.id, { barcode: loans[0].barcode });
    expect(r.status).toBe(201);
    expect((await getHold(holdA.id)).status).toBe('fulfilled');
  });

  it('serves a returned copy to the holder before the shelf, with several copies out', async () => {
    const { book, loans } = await bookOnLoan(2);
    const a = await makeMember(ctx, librarian);
    const b = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    const holdB = (await hold(b.id, book.id)).body;
    await giveBack(loans[0].id);
    await giveBack(loans[1].id);
    expect((await getHold(holdA.id)).status).toBe('ready');
    expect((await getHold(holdB.id)).status).toBe('ready');
    const barcodes = new Set([
      (await getHold(holdA.id)).barcode,
      (await getHold(holdB.id)).barcode,
    ]);
    expect(barcodes.size).toBe(2);
  });
});

describe('cancelling and expiring', () => {
  it('cancelling a waiting hold moves everyone behind it up', async () => {
    const { book } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const b = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    const holdB = (await hold(b.id, book.id)).body;
    const r = await ctx.http().post(`/api/v1/holds/${holdA.id}/cancel`).set(librarian.auth);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('cancelled');
    expect((await getHold(holdB.id)).queuePosition).toBe(1);
    const again = await ctx.http().post(`/api/v1/holds/${holdA.id}/cancel`).set(librarian.auth);
    expect(again.body.code).toBe('hold-closed');
  });

  it('cancelling a ready hold passes the copy on, or puts it back on the shelf', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const b = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    const holdB = (await hold(b.id, book.id)).body;
    await giveBack(loans[0].id);

    await ctx.http().post(`/api/v1/holds/${holdA.id}/cancel`).set(librarian.auth);
    expect(await getHold(holdB.id)).toMatchObject({ status: 'ready', barcode: loans[0].barcode });

    await ctx.http().post(`/api/v1/holds/${holdB.id}/cancel`).set(librarian.auth);
    expect((await copiesOf(book.id))[0]!.status).toBe('available');
    expect((await ctx.http().get(`/api/v1/books/${book.id}`)).body.availableCopies).toBe(1);
  });

  it('an unclaimed hold expires and its copy goes to the next member', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const b = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    const holdB = (await hold(b.id, book.id)).body;
    await giveBack(loans[0].id);
    await ctx.pool.query(`update holds set expires_at = now() - interval '1 hour' where id = $1`, [
      holdA.id,
    ]);

    const swept = await ctx.http().post('/api/v1/holds/process').set(librarian.auth);
    expect(swept.status).toBe(200);
    expect(swept.body.expired).toBeGreaterThanOrEqual(1);
    expect(await getHold(holdA.id)).toMatchObject({ status: 'expired' });
    expect(await getHold(holdB.id)).toMatchObject({ status: 'ready', barcode: loans[0].barcode });
  });

  it('expiry also happens by itself when the desk lends or lists', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    await giveBack(loans[0].id);
    await ctx.pool.query(
      `update holds set expires_at = now() - interval '1 minute' where id = $1`,
      [holdA.id],
    );

    const other = await makeMember(ctx, librarian);
    const r = await lend(other.id, { bookId: book.id });
    expect(r.status).toBe(201);
    expect((await getHold(holdA.id)).status).toBe('expired');
  });
});

describe('the rest of the library keeps the queue honest', () => {
  it('a held copy that is declared lost sends its member back to waiting', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    await giveBack(loans[0].id);
    expect((await getHold(holdA.id)).status).toBe('ready');

    const [copy] = await copiesOf(book.id);
    const r = await ctx
      .http()
      .patch(`/api/v1/copies/${copy!.id}`)
      .set(librarian.auth)
      .send({ version: copy!.version, status: 'lost' });
    expect(r.status).toBe(200);
    expect(await getHold(holdA.id)).toMatchObject({
      status: 'waiting',
      barcode: null,
      queuePosition: 1,
    });

    // Finding it again offers it to the member who was waiting.
    const [lostCopy] = await copiesOf(book.id);
    const found = await ctx
      .http()
      .patch(`/api/v1/copies/${lostCopy!.id}`)
      .set(librarian.auth)
      .send({ version: lostCopy!.version, status: 'available' });
    expect(found.body.status).toBe('held');
    expect((await getHold(holdA.id)).status).toBe('ready');
  });

  it('a new copy added to the shelf goes to the person waiting', async () => {
    const { book } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    const copy = await ctx
      .http()
      .post(`/api/v1/books/${book.id}/copies`)
      .set(librarian.auth)
      .send({ count: 1 });
    expect(copy.status).toBe(201);
    expect((await getHold(holdA.id)).status).toBe('ready');
  });

  it('removing a member cancels their holds and passes held copies on', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const b = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    const holdB = (await hold(b.id, book.id)).body;
    await giveBack(loans[0].id);
    const del = await ctx.http().delete(`/api/v1/members/${a.id}`).set(librarian.auth);
    expect(del.status).toBe(204);
    expect((await getHold(holdA.id)).status).toBe('cancelled');
    expect((await getHold(holdB.id)).status).toBe('ready');
  });

  it('removing a book closes its queue without setting any copy aside', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    await giveBack(loans[0].id);
    const del = await ctx.http().delete(`/api/v1/books/${book.id}`).set(librarian.auth);
    expect(del.status).toBe(204);
    expect((await getHold(holdA.id)).status).toBe('cancelled');
    const states = await ctx.pool.query(`select status from book_copies where book_id = $1`, [
      book.id,
    ]);
    expect(states.rows.every((r: { status: string }) => r.status === 'withdrawn')).toBe(true);
  });

  it('the database refuses a second live hold or a half-updated hold', async () => {
    const { book } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const made = (await hold(a.id, book.id)).body;
    await expect(
      ctx.pool.query(
        `insert into holds (book_id, member_id, placed_by) values ($1, $2, (select id from users limit 1))`,
        [book.id, a.id],
      ),
    ).rejects.toThrow(/holds_one_live_per_member_book/);
    await expect(
      ctx.pool.query(`update holds set status = 'ready' where id = $1`, [made.id]),
    ).rejects.toThrow(/holds_ready_shape/);
  });

  it('every change to the queue leaves an audit row', async () => {
    const { book, loans } = await bookOnLoan();
    const a = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    await giveBack(loans[0].id);
    await lend(a.id, { bookId: book.id });
    const rows = await ctx.pool.query(
      `select action from audit_log where entity_type = 'hold' and entity_id = $1 order by id`,
      [holdA.id],
    );
    expect(rows.rows.map((r: { action: string }) => r.action)).toEqual([
      'hold.placed',
      'hold.ready',
      'hold.fulfilled',
    ]);
  });
});

describe('concurrency', () => {
  it('two desks returning different copies at once serve two different members', async () => {
    const { book, loans } = await bookOnLoan(2);
    const a = await makeMember(ctx, librarian);
    const b = await makeMember(ctx, librarian);
    const holdA = (await hold(a.id, book.id)).body;
    const holdB = (await hold(b.id, book.id)).body;
    const [r1, r2] = await Promise.all([giveBack(loans[0].id), giveBack(loans[1].id)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const [ha, hb] = [await getHold(holdA.id), await getHold(holdB.id)];
    expect([ha.status, hb.status]).toEqual(['ready', 'ready']);
    expect(ha.barcode).not.toBe(hb.barcode);
  });

  it('a hold placed while the last copy is coming back is never stranded', async () => {
    for (let round = 0; round < 3; round += 1) {
      const { book, loans } = await bookOnLoan();
      const a = await makeMember(ctx, librarian);
      const [back, placed] = await Promise.all([giveBack(loans[0].id), hold(a.id, book.id)]);
      expect(back.status).toBe(200);
      if (placed.status === 201) {
        // The hold won the race: the return must have offered the copy to it.
        expect((await getHold(placed.body.id)).status).toBe('ready');
      } else {
        // The return won: a copy is on the shelf, so the hold was refused.
        expect(placed.body.code).toBe('copy-available');
        expect((await copiesOf(book.id))[0]!.status).toBe('available');
      }
    }
  });
});
