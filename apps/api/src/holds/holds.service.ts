import { Inject, Injectable } from '@nestjs/common';
import { conflict, notFound, toPage } from '@library/kit';
import { and, asc, count, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { recordAudit } from '../common/audit.js';
import type { Principal } from '../common/auth.js';
import { pgCode } from '../common/errors.js';
import { POLICY } from '../circulation/policy.js';
import { DB, type Database, type Tx } from '../db/db.module.js';
import { bookCopies, books, holds, loans, members, outboxEvents } from '../db/schema.js';
import type { HoldDto, ListHoldsQuery, PlaceHold } from './holds.contract.js';
import { expireStaleHolds, fillHolds, lockBook } from './hold-queue.js';

const holdColumns = {
  id: holds.id,
  bookId: holds.bookId,
  bookTitle: books.title,
  memberId: holds.memberId,
  memberName: members.name,
  status: holds.status,
  placedAt: holds.placedAt,
  barcode: bookCopies.barcode,
  readyAt: holds.readyAt,
  expiresAt: holds.expiresAt,
  closedAt: holds.closedAt,
  fulfilledLoanId: holds.fulfilledLoanId,
  queuePosition: sql<number | null>`case when ${holds.status} = 'waiting' then (
      select count(*)::int + 1 from holds h2
      where h2.book_id = ${holds.bookId} and h2.status = 'waiting'
        and (h2.placed_at, h2.id) < (${holds.placedAt}, ${holds.id})
    ) end`,
};

type HoldJoined = {
  id: string;
  bookId: string;
  bookTitle: string;
  memberId: string;
  memberName: string;
  status: HoldDto['status'];
  placedAt: Date;
  barcode: string | null;
  readyAt: Date | null;
  expiresAt: Date | null;
  closedAt: Date | null;
  fulfilledLoanId: string | null;
  queuePosition: number | null;
};

const iso = (d: Date | null) => d?.toISOString() ?? null;

const toDto = (r: HoldJoined): HoldDto => ({
  id: r.id,
  bookId: r.bookId,
  bookTitle: r.bookTitle,
  memberId: r.memberId,
  memberName: r.memberName,
  status: r.status,
  placedAt: r.placedAt.toISOString(),
  queuePosition: r.queuePosition,
  barcode: r.barcode,
  readyAt: iso(r.readyAt),
  expiresAt: iso(r.expiresAt),
  closedAt: iso(r.closedAt),
  fulfilledLoanId: r.fulfilledLoanId,
});

@Injectable()
export class HoldsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Join the queue for a book whose copies are all out. A hold on a book that is on the shelf
   * would only delay the member, so it is refused: lend it instead.
   */
  async place(actor: Principal, input: PlaceHold): Promise<HoldDto> {
    try {
      return await this.db.transaction(async (tx) => {
        // Lock order everywhere is member, then book, then the book's holds and copies.
        const [member] = await tx
          .select()
          .from(members)
          .where(and(eq(members.id, input.memberId), isNull(members.deletedAt)))
          .for('update');
        if (!member) throw notFound(`Member ${input.memberId} does not exist`);
        if (!(await lockBook(tx, input.bookId)))
          throw notFound(`Book ${input.bookId} does not exist`);
        await expireStaleHolds(tx, actor.userId);

        const [book] = await tx
          .select({ id: books.id })
          .from(books)
          .where(and(eq(books.id, input.bookId), isNull(books.deletedAt)));
        if (!book) throw notFound(`Book ${input.bookId} does not exist`);
        if (member.status !== 'active') {
          throw conflict(
            'member-suspended',
            'Member is suspended',
            'A suspended member cannot place holds',
          );
        }

        const [live] = await tx
          .select({ n: count() })
          .from(holds)
          .where(and(eq(holds.memberId, member.id), sql`${holds.status} in ('waiting', 'ready')`));
        if ((live?.n ?? 0) >= POLICY.maxLiveHolds) {
          throw conflict(
            'hold-limit',
            'Hold limit reached',
            `A member may have ${POLICY.maxLiveHolds} holds at once`,
          );
        }

        const [reading] = await tx
          .select({ id: loans.id })
          .from(loans)
          .innerJoin(bookCopies, eq(bookCopies.id, loans.copyId))
          .where(
            and(
              eq(loans.memberId, member.id),
              eq(bookCopies.bookId, book.id),
              isNull(loans.returnedAt),
            ),
          )
          .limit(1);
        if (reading) {
          throw conflict(
            'already-borrowed',
            'Member already has this book',
            'They have a copy on loan now',
          );
        }

        const [shelf] = await tx
          .select({
            circulating: sql<number>`count(*) filter (where ${bookCopies.status} in ('available', 'held', 'on_loan'))::int`,
            available: sql<number>`count(*) filter (where ${bookCopies.status} = 'available')::int`,
          })
          .from(bookCopies)
          .where(eq(bookCopies.bookId, book.id));
        if ((shelf?.circulating ?? 0) === 0) {
          throw conflict(
            'no-copies',
            'No copies in circulation',
            'Every copy is lost or withdrawn',
          );
        }
        if ((shelf?.available ?? 0) > 0) {
          throw conflict(
            'copy-available',
            'A copy is on the shelf',
            'Lend it now instead of placing a hold',
          );
        }

        const [row] = await tx
          .insert(holds)
          .values({ bookId: book.id, memberId: member.id, placedBy: actor.userId })
          .returning({ id: holds.id });
        const dto = await this.read(tx, row!.id);
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'hold.placed',
          entityType: 'hold',
          entityId: dto.id,
          after: dto,
        });
        return dto;
      });
    } catch (e) {
      if (pgCode(e) === '23505') {
        throw conflict(
          'hold-exists',
          'Hold already placed',
          'This member is already in the queue for this book',
        );
      }
      throw e;
    }
  }

  async list(query: ListHoldsQuery) {
    await this.db.transaction((tx) => expireStaleHolds(tx));
    const where: SQL[] = [];
    if (query.status) where.push(eq(holds.status, query.status));
    if (query.memberId) where.push(eq(holds.memberId, query.memberId));
    if (query.bookId) where.push(eq(holds.bookId, query.bookId));
    const [rows, totals] = await Promise.all([
      this.joined(this.db)
        .where(and(...where))
        .orderBy(desc(holds.placedAt), asc(holds.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: count() })
        .from(holds)
        .where(and(...where)),
    ]);
    return toPage(rows.map(toDto), totals[0]?.total ?? 0, query);
  }

  async get(id: string): Promise<HoldDto> {
    return this.read(this.db, id);
  }

  /** Withdraw a hold. A ready one frees its copy for the next member in line. */
  async cancel(actor: Principal, id: string): Promise<HoldDto> {
    return this.db.transaction(async (tx) => {
      const [probe] = await tx.select({ bookId: holds.bookId }).from(holds).where(eq(holds.id, id));
      if (!probe) throw notFound(`Hold ${id} does not exist`);
      await lockBook(tx, probe.bookId);
      const [hold] = await tx.select().from(holds).where(eq(holds.id, id)).for('update');
      if (!hold) throw notFound(`Hold ${id} does not exist`);
      if (hold.status !== 'waiting' && hold.status !== 'ready') {
        throw conflict('hold-closed', 'Hold is already closed', `It is ${hold.status}`);
      }
      const before = await this.read(tx, id);
      await tx
        .update(holds)
        .set({ status: 'cancelled', closedAt: new Date(), version: sql`${holds.version} + 1` })
        .where(eq(holds.id, id));
      if (hold.status === 'ready' && hold.copyId) {
        await tx
          .update(bookCopies)
          .set({
            status: 'available',
            version: sql`${bookCopies.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(and(eq(bookCopies.id, hold.copyId), eq(bookCopies.status, 'held')));
        await fillHolds(tx, hold.bookId, actor.userId);
      }
      const after = await this.read(tx, id);
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'hold.cancelled',
        entityType: 'hold',
        entityId: id,
        before,
        after,
      });
      await tx.insert(outboxEvents).values({
        topic: 'hold.cancelled',
        payload: { holdId: id, memberId: hold.memberId, bookId: hold.bookId },
      });
      return after;
    });
  }

  /** Expire every hold past its pickup deadline now. The same sweep runs on every borrow, return and list. */
  async process(actor: Principal): Promise<{ expired: number }> {
    return this.db.transaction(async (tx) => ({
      expired: await expireStaleHolds(tx, actor.userId),
    }));
  }

  private joined(executor: Pick<Database, 'select'>) {
    return executor
      .select(holdColumns)
      .from(holds)
      .innerJoin(books, eq(books.id, holds.bookId))
      .innerJoin(members, eq(members.id, holds.memberId))
      .leftJoin(bookCopies, eq(bookCopies.id, holds.copyId));
  }

  private async read(executor: Pick<Database, 'select'> | Tx, id: string): Promise<HoldDto> {
    const [row] = await this.joined(executor as Pick<Database, 'select'>).where(eq(holds.id, id));
    if (!row) throw notFound(`Hold ${id} does not exist`);
    return toDto(row);
  }
}
