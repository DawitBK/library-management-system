import { randomUUID } from 'node:crypto';
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
let admin: Session;
let genreId: string;

beforeAll(async () => {
  ctx = await startContext();
  librarian = await makeStaff(ctx);
  admin = await makeStaff(ctx, 'admin');
  genreId = await makeGenre(ctx, librarian);
});
afterAll(async () => {
  await ctx.close();
});

const lend = (memberId: string, body: Record<string, unknown>, key?: string, who = librarian) => {
  const req = ctx.http().post('/api/v1/loans').set(who.auth);
  if (key) req.set('Idempotency-Key', key);
  return req.send({ memberId, ...body });
};
/** Make a loan `days` days overdue (rounded up: it is `days` minus half a day late, so exactly `days` charged). */
const makeOverdue = (loanId: string, days: number) =>
  ctx.pool.query(
    `update loans set borrowed_at = now() - make_interval(days => $2 + 14),
                      due_at = now() - make_interval(days => $2) + interval '12 hours' where id = $1`,
    [loanId, days],
  );

describe('lending', () => {
  it('lends by book or by barcode and marks the copy out', async () => {
    const book = await makeBook(ctx, librarian, genreId, { copies: 2 });
    const member = await makeMember(ctx, librarian);
    const byBook = await lend(member.id, { bookId: book.id });
    expect(byBook.status).toBe(201);
    expect(byBook.body).toMatchObject({ bookId: book.id, memberId: member.id, overdue: false });
    const due = new Date(byBook.body.dueAt).getTime() - new Date(byBook.body.borrowedAt).getTime();
    expect(Math.round(due / 86_400_000)).toBe(14);
    expect((await ctx.http().get(`/api/v1/books/${book.id}`)).body.availableCopies).toBe(1);

    const copies = (await ctx.http().get(`/api/v1/books/${book.id}/copies`).set(librarian.auth))
      .body;
    const free = copies.find((c: { status: string }) => c.status === 'available');
    const other = await makeMember(ctx, librarian);
    const byCode = await lend(other.id, { barcode: free.barcode });
    expect(byCode.status).toBe(201);
    expect(byCode.body.barcode).toBe(free.barcode);
    const taken = await lend((await makeMember(ctx, librarian)).id, { barcode: free.barcode });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('copy-unavailable');
  });

  it('rejects an ambiguous request, a missing member and a book with no copy free', async () => {
    const book = await makeBook(ctx, librarian, genreId, { copies: 1 });
    const member = await makeMember(ctx, librarian);
    expect((await lend(member.id, {})).status).toBe(400);
    expect((await lend(member.id, { bookId: book.id, barcode: 'LB-1' })).status).toBe(400);
    expect((await lend(randomUUID(), { bookId: book.id })).status).toBe(404);
    expect((await lend(member.id, { barcode: 'NO-SUCH-BARCODE' })).status).toBe(404);

    await lend(member.id, { bookId: book.id });
    const none = await lend((await makeMember(ctx, librarian)).id, { bookId: book.id });
    expect(none.status).toBe(409);
    expect(none.body.code).toBe('no-copy-available');
  });

  it('enforces the loan limit and refuses suspended members', async () => {
    const member = await makeMember(ctx, librarian);
    for (let i = 0; i < 5; i += 1) {
      const book = await makeBook(ctx, librarian, genreId);
      expect((await lend(member.id, { bookId: book.id })).status).toBe(201);
    }
    const sixth = await lend(member.id, { bookId: (await makeBook(ctx, librarian, genreId)).id });
    expect(sixth.status).toBe(409);
    expect(sixth.body.code).toBe('loan-limit');
    expect(
      (await ctx.http().get(`/api/v1/members/${member.id}`).set(librarian.auth)).body.openLoans,
    ).toBe(5);

    const suspended = await makeMember(ctx, librarian, 'suspended');
    const res = await lend(suspended.id, { bookId: (await makeBook(ctx, librarian, genreId)).id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('member-suspended');
  });

  it('hands the last copy to exactly one of several desks lending at once', async () => {
    const book = await makeBook(ctx, librarian, genreId, { copies: 1 });
    const members = await Promise.all(Array.from({ length: 6 }, () => makeMember(ctx, librarian)));
    const results = await Promise.all(members.map((m) => lend(m.id, { bookId: book.id })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const { rows } = await ctx.pool.query(
      `select count(*)::int as n from loans l join book_copies c on c.id = l.copy_id
        where c.book_id = $1 and l.returned_at is null`,
      [book.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('keeps one member from exceeding the limit through parallel requests', async () => {
    const member = await makeMember(ctx, librarian);
    const books = await Promise.all(
      Array.from({ length: 8 }, () => makeBook(ctx, librarian, genreId)),
    );
    const results = await Promise.all(books.map((b) => lend(member.id, { bookId: b.id })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('replays the stored loan for a repeated Idempotency-Key', async () => {
    const book = await makeBook(ctx, librarian, genreId, { copies: 2 });
    const member = await makeMember(ctx, librarian);
    const key = randomUUID();
    const first = await lend(member.id, { bookId: book.id }, key);
    const second = await lend(member.id, { bookId: book.id }, key);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect((await ctx.http().get(`/api/v1/books/${book.id}`)).body.availableCopies).toBe(1);

    const reuse = await lend(member.id, { bookId: randomUUID() }, key);
    expect(reuse.status).toBe(422);
    expect(reuse.body.code).toBe('idempotency-key-reuse');
  });

  it('lets the database refuse a second open loan on one copy', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    const member = await makeMember(ctx, librarian);
    const loan = await lend(member.id, { bookId: book.id });
    await expect(
      ctx.pool.query(
        `insert into loans (copy_id, member_id, due_at, issued_by) values ($1, $2, now() + interval '1 day', $3)`,
        [loan.body.copyId, member.id, librarian.id],
      ),
    ).rejects.toThrow(/loans_one_open_per_copy/);
  });
});

describe('returning, renewing and fines', () => {
  it('takes a book back on time without a fine and frees the copy', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    const member = await makeMember(ctx, librarian);
    const loan = (await lend(member.id, { bookId: book.id })).body;
    const back = await ctx.http().post(`/api/v1/loans/${loan.id}/return`).set(librarian.auth);
    expect(back.status).toBe(200);
    expect(back.body.fine).toBeNull();
    expect(back.body.loan.returnedAt).not.toBeNull();
    expect((await ctx.http().get(`/api/v1/books/${book.id}`)).body.availableCopies).toBe(1);

    const twice = await ctx.http().post(`/api/v1/loans/${loan.id}/return`).set(librarian.auth);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('already-returned');
  });

  it('charges a fine per overdue day on a late return', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    const member = await makeMember(ctx, librarian);
    const loan = (await lend(member.id, { bookId: book.id })).body;
    await makeOverdue(loan.id, 3);
    const back = await ctx.http().post(`/api/v1/loans/${loan.id}/return`).set(librarian.auth);
    expect(back.body.fine).toMatchObject({ amountMinor: 3 * 200, status: 'unpaid' });
    const detail = await ctx.http().get(`/api/v1/members/${member.id}`).set(librarian.auth);
    expect(detail.body.unpaidFinesMinor).toBe(600);

    const pay = await ctx.http().post(`/api/v1/fines/${back.body.fine.id}/pay`).set(librarian.auth);
    expect(pay.body.status).toBe('paid');
    expect(
      (await ctx.http().post(`/api/v1/fines/${back.body.fine.id}/pay`).set(librarian.auth)).status,
    ).toBe(409);
    expect(
      (await ctx.http().get(`/api/v1/members/${member.id}`).set(librarian.auth)).body
        .unpaidFinesMinor,
    ).toBe(0);
  });

  it('blocks borrowing while fines are high, until they are paid or waived by an admin', async () => {
    const member = await makeMember(ctx, librarian);
    const book = await makeBook(ctx, librarian, genreId);
    const loan = (await lend(member.id, { bookId: book.id })).body;
    await makeOverdue(loan.id, 25); // 25 days x 200 = 5000, the borrowing threshold
    const back = await ctx.http().post(`/api/v1/loans/${loan.id}/return`).set(librarian.auth);
    expect(back.body.fine.amountMinor).toBe(5000);

    const blocked = await lend(member.id, { bookId: (await makeBook(ctx, librarian, genreId)).id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('fines-outstanding');

    const bad = await ctx
      .http()
      .post(`/api/v1/fines/${back.body.fine.id}/waive`)
      .set(librarian.auth)
      .send({ reason: 'Hardship, agreed by the head librarian' });
    expect(bad.status).toBe(403);
    const noReason = await ctx
      .http()
      .post(`/api/v1/fines/${back.body.fine.id}/waive`)
      .set(admin.auth)
      .send({ reason: '' });
    expect(noReason.status).toBe(400);
    const waived = await ctx
      .http()
      .post(`/api/v1/fines/${back.body.fine.id}/waive`)
      .set(admin.auth)
      .send({ reason: 'Hardship, agreed by the head librarian' });
    expect(waived.body).toMatchObject({ status: 'waived' });
    const again = await lend(member.id, { bookId: (await makeBook(ctx, librarian, genreId)).id });
    expect(again.status).toBe(201);
  });

  it('renews a loan up to the limit, and never once overdue', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    const member = await makeMember(ctx, librarian);
    const loan = (await lend(member.id, { bookId: book.id })).body;
    const first = await ctx.http().post(`/api/v1/loans/${loan.id}/renew`).set(librarian.auth);
    expect(first.status).toBe(200);
    expect(first.body.renewals).toBe(1);
    expect(new Date(first.body.dueAt).getTime() - new Date(loan.dueAt).getTime()).toBe(
      14 * 86_400_000,
    );
    expect(
      (await ctx.http().post(`/api/v1/loans/${loan.id}/renew`).set(librarian.auth)).status,
    ).toBe(200);
    const third = await ctx.http().post(`/api/v1/loans/${loan.id}/renew`).set(librarian.auth);
    expect(third.status).toBe(409);
    expect(third.body.code).toBe('renewal-limit');

    const late = (await lend(member.id, { bookId: (await makeBook(ctx, librarian, genreId)).id }))
      .body;
    await makeOverdue(late.id, 2);
    const refused = await ctx.http().post(`/api/v1/loans/${late.id}/renew`).set(librarian.auth);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('loan-overdue');
  });

  it('keeps a member record while they still hold a book', async () => {
    const member = await makeMember(ctx, librarian);
    const book = await makeBook(ctx, librarian, genreId);
    const loan = (await lend(member.id, { bookId: book.id })).body;
    const blocked = await ctx.http().delete(`/api/v1/members/${member.id}`).set(librarian.auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('member-has-obligations');
    await ctx.http().post(`/api/v1/loans/${loan.id}/return`).set(librarian.auth);
    expect(
      (await ctx.http().delete(`/api/v1/members/${member.id}`).set(librarian.auth)).status,
    ).toBe(204);
    expect((await ctx.http().get(`/api/v1/members/${member.id}`).set(librarian.auth)).status).toBe(
      404,
    );
  });
});

describe('listings and reports', () => {
  it('filters loans by status and member', async () => {
    const member = await makeMember(ctx, librarian);
    const a = (await lend(member.id, { bookId: (await makeBook(ctx, librarian, genreId)).id }))
      .body;
    const b = (await lend(member.id, { bookId: (await makeBook(ctx, librarian, genreId)).id }))
      .body;
    await ctx.http().post(`/api/v1/loans/${a.id}/return`).set(librarian.auth);
    await makeOverdue(b.id, 4);

    const all = await ctx.http().get(`/api/v1/loans?memberId=${member.id}`).set(librarian.auth);
    expect(all.body.page.total).toBe(2);
    const open = await ctx
      .http()
      .get(`/api/v1/loans?memberId=${member.id}&status=open`)
      .set(librarian.auth);
    expect(open.body.items.map((l: { id: string }) => l.id)).toEqual([b.id]);
    const overdue = await ctx
      .http()
      .get(`/api/v1/loans?memberId=${member.id}&status=overdue`)
      .set(librarian.auth);
    expect(overdue.body.items[0]).toMatchObject({ id: b.id, overdue: true, daysOverdue: 4 });
    const returned = await ctx
      .http()
      .get(`/api/v1/loans?memberId=${member.id}&status=returned`)
      .set(librarian.auth);
    expect(returned.body.items.map((l: { id: string }) => l.id)).toEqual([a.id]);
  });

  it('reports overdue loans, popular genres and the dashboard totals', async () => {
    const g = await makeGenre(ctx, librarian);
    const member = await makeMember(ctx, librarian);
    const loans = [];
    for (let i = 0; i < 2; i += 1) {
      loans.push((await lend(member.id, { bookId: (await makeBook(ctx, librarian, g)).id })).body);
    }
    await makeOverdue(loans[0]!.id, 6);

    const overdue = await ctx.http().get('/api/v1/reports/overdue').set(librarian.auth);
    expect(overdue.body.map((l: { id: string }) => l.id)).toContain(loans[0]!.id);
    expect(overdue.body.map((l: { id: string }) => l.id)).not.toContain(loans[1]!.id);

    const popular = await ctx
      .http()
      .get('/api/v1/reports/popular-genres?days=30')
      .set(librarian.auth);
    expect(popular.body.find((p: { genreId: string }) => p.genreId === g)?.loans).toBe(2);
    expect(
      (await ctx.http().get('/api/v1/reports/popular-genres?days=0').set(librarian.auth)).status,
    ).toBe(400);

    const summary = await ctx.http().get('/api/v1/reports/summary').set(librarian.auth);
    expect(summary.body.openLoans).toBeGreaterThanOrEqual(2);
    expect(summary.body.overdueLoans).toBeGreaterThanOrEqual(1);
    expect(summary.body.copies).toBeGreaterThanOrEqual(summary.body.availableCopies);
    expect((await ctx.http().get('/api/v1/reports/summary')).status).toBe(401);
  });

  it('records the loan trail in the audit log and the outbox', async () => {
    const book = await makeBook(ctx, librarian, genreId);
    const member = await makeMember(ctx, librarian);
    const loan = (await lend(member.id, { bookId: book.id })).body;
    await ctx.http().post(`/api/v1/loans/${loan.id}/renew`).set(librarian.auth);
    await ctx.http().post(`/api/v1/loans/${loan.id}/return`).set(librarian.auth);

    const audit = await ctx.pool.query(
      `select action from audit_log where entity_type = 'loan' and entity_id = $1 order by id`,
      [loan.id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'loan.created',
      'loan.renewed',
      'loan.returned',
    ]);
    const outbox = await ctx.pool.query(
      `select topic from outbox_events where payload->>'loanId' = $1 order by id`,
      [loan.id],
    );
    expect(outbox.rows.map((r) => r.topic)).toEqual(['loan.created', 'loan.returned']);
  });
});
