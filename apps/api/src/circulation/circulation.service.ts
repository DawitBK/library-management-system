import { Inject, Injectable } from '@nestjs/common';
import { conflict, notFound, toPage } from '@library/kit';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { recordAudit } from '../common/audit.js';
import type { Principal } from '../common/auth.js';
import { runIdempotent, type Outcome } from '../common/idempotency.js';
import { DB, type Database, type Tx } from '../db/db.module.js';
import {
  bookCopies,
  books,
  fines,
  genres,
  holds,
  loans,
  members,
  outboxEvents,
  type FineRow,
} from '../db/schema.js';
import { expireStaleHolds, fillHolds, lockBook } from '../holds/hold-queue.js';
import { memberStanding } from '../members/members.service.js';
import type {
  CreateLoan,
  FineDto,
  ListFinesQuery,
  ListLoansQuery,
  LoanDto,
  PopularGenresQuery,
  ReturnResult,
  Summary,
  WaiveFine,
} from './circulation.contract.js';
import { addDays, daysOverdue, POLICY } from './policy.js';

const LOAN_SORT = { borrowedAt: loans.borrowedAt, dueAt: loans.dueAt } as const;

const loanColumns = {
  id: loans.id,
  memberId: loans.memberId,
  memberName: members.name,
  copyId: loans.copyId,
  barcode: bookCopies.barcode,
  bookId: books.id,
  bookTitle: books.title,
  borrowedAt: loans.borrowedAt,
  dueAt: loans.dueAt,
  returnedAt: loans.returnedAt,
  renewals: loans.renewals,
};
type LoanJoined = {
  id: string;
  memberId: string;
  memberName: string;
  copyId: string;
  barcode: string;
  bookId: string;
  bookTitle: string;
  borrowedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  renewals: number;
};

const toLoanDto = (r: LoanJoined, now = new Date()): LoanDto => {
  const late = daysOverdue(r.dueAt, r.returnedAt ?? now);
  return {
    id: r.id,
    memberId: r.memberId,
    memberName: r.memberName,
    copyId: r.copyId,
    barcode: r.barcode,
    bookId: r.bookId,
    bookTitle: r.bookTitle,
    borrowedAt: r.borrowedAt.toISOString(),
    dueAt: r.dueAt.toISOString(),
    returnedAt: r.returnedAt?.toISOString() ?? null,
    renewals: r.renewals,
    overdue: r.returnedAt === null && late > 0,
    daysOverdue: late,
  };
};

const toFineDto = (row: FineRow): FineDto => ({
  id: row.id,
  loanId: row.loanId,
  memberId: row.memberId,
  amountMinor: row.amountMinor,
  status: row.paidAt ? 'paid' : row.waivedAt ? 'waived' : 'unpaid',
  waiveReason: row.waiveReason,
  createdAt: row.createdAt.toISOString(),
});

async function enqueue(tx: Tx, topic: string, payload: Record<string, unknown>): Promise<void> {
  await tx.insert(outboxEvents).values({ topic, payload });
}

@Injectable()
export class CirculationService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Lend a copy. The member row is locked first, so two desks serving one member at once cannot
   * both slip under the loan limit, and a copy is picked with `FOR UPDATE SKIP LOCKED`, so two
   * desks lending the last copy never both get it. The database also refuses a second open loan
   * on a copy (partial unique index), whatever this code does.
   */
  async borrow(
    actor: Principal,
    input: CreateLoan,
    key: string | undefined,
  ): Promise<Outcome<LoanDto>> {
    return runIdempotent(this.db, actor.userId, key, input, async (tx) => {
      const [member] = await tx
        .select()
        .from(members)
        .where(and(eq(members.id, input.memberId), isNull(members.deletedAt)))
        .for('update');
      if (!member) throw notFound(`Member ${input.memberId} does not exist`);
      if (member.status !== 'active') {
        throw conflict(
          'member-suspended',
          'Member is suspended',
          'A suspended member cannot borrow',
        );
      }
      const standing = await memberStanding(tx, member.id);
      if (standing.openLoans >= POLICY.maxOpenLoans) {
        throw conflict(
          'loan-limit',
          'Loan limit reached',
          `A member may hold at most ${POLICY.maxOpenLoans} books`,
        );
      }
      if (standing.unpaidFinesMinor >= POLICY.borrowBlockedAtFineMinor) {
        throw conflict(
          'fines-outstanding',
          'Outstanding fines',
          `Fines of ${standing.unpaidFinesMinor} minor units must be paid or waived first`,
        );
      }

      await expireStaleHolds(tx, actor.userId);
      const { copyId, holdId } = await this.pickCopy(tx, input, member.id);
      const now = new Date();
      await tx
        .update(bookCopies)
        .set({ status: 'on_loan', version: sql`${bookCopies.version} + 1`, updatedAt: sql`now()` })
        .where(eq(bookCopies.id, copyId));
      const [loan] = await tx
        .insert(loans)
        .values({
          copyId,
          memberId: member.id,
          borrowedAt: now,
          dueAt: addDays(now, POLICY.loanDays),
          issuedBy: actor.userId,
        })
        .returning({ id: loans.id });
      if (holdId) {
        await tx
          .update(holds)
          .set({
            status: 'fulfilled',
            closedAt: now,
            fulfilledLoanId: loan!.id,
            version: sql`${holds.version} + 1`,
          })
          .where(eq(holds.id, holdId));
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'hold.fulfilled',
          entityType: 'hold',
          entityId: holdId,
          after: { loanId: loan!.id },
        });
      }
      const body = await this.readLoan(tx, loan!.id);
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'loan.created',
        entityType: 'loan',
        entityId: body.id,
        after: body,
      });
      await enqueue(tx, 'loan.created', {
        loanId: body.id,
        memberId: body.memberId,
        bookTitle: body.bookTitle,
        dueAt: body.dueAt,
      });
      return { status: 201, body };
    });
  }

  async return(actor: Principal, loanId: string): Promise<ReturnResult> {
    return this.db.transaction(async (tx) => {
      const [loan] = await tx.select().from(loans).where(eq(loans.id, loanId)).for('update');
      if (!loan) throw notFound(`Loan ${loanId} does not exist`);
      if (loan.returnedAt) {
        throw conflict('already-returned', 'Loan was already returned');
      }
      const [returned] = await tx
        .select({ bookId: bookCopies.bookId })
        .from(bookCopies)
        .where(eq(bookCopies.id, loan.copyId));
      await lockBook(tx, returned!.bookId);
      const now = new Date();
      await tx
        .update(loans)
        .set({ returnedAt: now, version: sql`${loans.version} + 1` })
        .where(eq(loans.id, loanId));
      await tx
        .update(bookCopies)
        .set({
          status: 'available',
          version: sql`${bookCopies.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(bookCopies.id, loan.copyId));
      await fillHolds(tx, returned!.bookId, actor.userId);

      const late = daysOverdue(loan.dueAt, now);
      let fine: FineDto | null = null;
      if (late > 0) {
        const [row] = await tx
          .insert(fines)
          .values({
            loanId,
            memberId: loan.memberId,
            amountMinor: late * POLICY.finePerDayMinor,
          })
          .returning();
        fine = toFineDto(row!);
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'fine.charged',
          entityType: 'fine',
          entityId: fine.id,
          after: fine,
        });
      }
      const result = { loan: await this.readLoan(tx, loanId), fine };
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'loan.returned',
        entityType: 'loan',
        entityId: loanId,
        after: result.loan,
      });
      await enqueue(tx, 'loan.returned', { loanId, memberId: loan.memberId, daysOverdue: late });
      return result;
    });
  }

  async renew(actor: Principal, loanId: string): Promise<LoanDto> {
    return this.db.transaction(async (tx) => {
      const [loan] = await tx.select().from(loans).where(eq(loans.id, loanId)).for('update');
      if (!loan) throw notFound(`Loan ${loanId} does not exist`);
      if (loan.returnedAt) throw conflict('already-returned', 'Loan was already returned');
      if (loan.dueAt.getTime() <= Date.now()) {
        throw conflict('loan-overdue', 'Loan is overdue', 'Return the book instead of renewing it');
      }
      if (loan.renewals >= POLICY.maxRenewals) {
        throw conflict(
          'renewal-limit',
          'Renewal limit reached',
          `A loan can be renewed ${POLICY.maxRenewals} times`,
        );
      }
      const [member] = await tx.select().from(members).where(eq(members.id, loan.memberId));
      if (member?.status !== 'active') {
        throw conflict('member-suspended', 'Member is suspended');
      }
      const before = await this.readLoan(tx, loanId);
      await tx
        .update(loans)
        .set({
          dueAt: addDays(loan.dueAt, POLICY.renewalDays),
          renewals: sql`${loans.renewals} + 1`,
          version: sql`${loans.version} + 1`,
        })
        .where(eq(loans.id, loanId));
      const after = await this.readLoan(tx, loanId);
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'loan.renewed',
        entityType: 'loan',
        entityId: loanId,
        before,
        after,
      });
      return after;
    });
  }

  async getLoan(id: string): Promise<LoanDto> {
    return this.readLoan(this.db, id);
  }

  async listLoans(query: ListLoansQuery) {
    const now = new Date();
    const where: SQL[] = [];
    if (query.memberId) where.push(eq(loans.memberId, query.memberId));
    if (query.status === 'open') where.push(isNull(loans.returnedAt));
    if (query.status === 'returned') where.push(isNotNull(loans.returnedAt));
    if (query.status === 'overdue') where.push(isNull(loans.returnedAt), lt(loans.dueAt, now));
    const order = [
      ...query.sort.map((s) => (s.direction === 'asc' ? asc : desc)(LOAN_SORT[s.field])),
      asc(loans.id),
    ];
    const [rows, totals] = await Promise.all([
      this.joined(this.db)
        .where(and(...where))
        .orderBy(...order)
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: count() })
        .from(loans)
        .where(and(...where)),
    ]);
    return toPage(
      rows.map((r) => toLoanDto(r, now)),
      totals[0]?.total ?? 0,
      query,
    );
  }

  // ---------- fines ----------

  async listFines(query: ListFinesQuery) {
    const where: SQL[] = [];
    if (query.memberId) where.push(eq(fines.memberId, query.memberId));
    if (query.status === 'unpaid') where.push(isNull(fines.paidAt), isNull(fines.waivedAt));
    if (query.status === 'paid') where.push(isNotNull(fines.paidAt));
    if (query.status === 'waived') where.push(isNotNull(fines.waivedAt));
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(fines)
        .where(and(...where))
        .orderBy(desc(fines.createdAt), asc(fines.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: count() })
        .from(fines)
        .where(and(...where)),
    ]);
    return toPage(rows.map(toFineDto), totals[0]?.total ?? 0, query);
  }

  async payFine(actor: Principal, id: string): Promise<FineDto> {
    return this.settleFine(actor, id, 'fine.paid', { paidAt: new Date() });
  }

  async waiveFine(actor: Principal, id: string, input: WaiveFine): Promise<FineDto> {
    return this.settleFine(actor, id, 'fine.waived', {
      waivedAt: new Date(),
      waivedBy: actor.userId,
      waiveReason: input.reason,
    });
  }

  // ---------- reports ----------

  async overdueReport(): Promise<LoanDto[]> {
    const now = new Date();
    const rows = await this.joined(this.db)
      .where(and(isNull(loans.returnedAt), lt(loans.dueAt, now)))
      .orderBy(asc(loans.dueAt), asc(loans.id))
      .limit(500);
    return rows.map((r) => toLoanDto(r, now));
  }

  async popularGenres(query: PopularGenresQuery) {
    const since = addDays(new Date(), -query.days);
    const rows = await this.db
      .select({ genreId: genres.id, genre: genres.name, loans: count() })
      .from(loans)
      .innerJoin(bookCopies, eq(bookCopies.id, loans.copyId))
      .innerJoin(books, eq(books.id, bookCopies.bookId))
      .innerJoin(genres, eq(genres.id, books.genreId))
      .where(gte(loans.borrowedAt, since))
      .groupBy(genres.id, genres.name)
      .orderBy(desc(count()), asc(genres.name))
      .limit(query.limit);
    return rows;
  }

  async summary(): Promise<Summary> {
    const now = new Date();
    const [titles] = await this.db
      .select({ n: count() })
      .from(books)
      .where(isNull(books.deletedAt));
    const [copies] = await this.db
      .select({
        total: sql<number>`count(*) filter (where ${bookCopies.status} <> 'withdrawn')::int`,
        available: sql<number>`count(*) filter (where ${bookCopies.status} = 'available')::int`,
      })
      .from(bookCopies);
    const [mem] = await this.db
      .select({ n: count() })
      .from(members)
      .where(isNull(members.deletedAt));
    const [open] = await this.db.select({ n: count() }).from(loans).where(isNull(loans.returnedAt));
    const [overdue] = await this.db
      .select({ n: count() })
      .from(loans)
      .where(and(isNull(loans.returnedAt), lt(loans.dueAt, now)));
    const [owed] = await this.db
      .select({ sum: sql<number>`coalesce(sum(${fines.amountMinor}), 0)::bigint` })
      .from(fines)
      .where(and(isNull(fines.paidAt), isNull(fines.waivedAt)));
    return {
      titles: titles?.n ?? 0,
      copies: copies?.total ?? 0,
      availableCopies: copies?.available ?? 0,
      members: mem?.n ?? 0,
      openLoans: open?.n ?? 0,
      overdueLoans: overdue?.n ?? 0,
      unpaidFinesMinor: Number(owed?.sum ?? 0),
    };
  }

  // ---------- helpers ----------

  private async settleFine(
    actor: Principal,
    id: string,
    action: string,
    set: Partial<typeof fines.$inferInsert>,
  ): Promise<FineDto> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(fines).where(eq(fines.id, id)).for('update');
      if (!current) throw notFound(`Fine ${id} does not exist`);
      if (current.paidAt || current.waivedAt) {
        throw conflict('fine-settled', 'Fine is already settled');
      }
      const [row] = await tx.update(fines).set(set).where(eq(fines.id, id)).returning();
      const after = toFineDto(row!);
      await recordAudit(tx, {
        actor: actor.userId,
        action,
        entityType: 'fine',
        entityId: id,
        before: toFineDto(current),
        after,
      });
      return after;
    });
  }

  /**
   * Choose the copy to lend. A copy set aside by a hold goes only to the member it is held for;
   * lending by book prefers that member's own ready hold, then any copy still on the shelf.
   */
  private async pickCopy(
    tx: Tx,
    input: CreateLoan,
    memberId: string,
  ): Promise<{ copyId: string; holdId: string | null }> {
    if (input.barcode !== undefined) {
      const [copy] = await tx
        .select({ id: bookCopies.id, status: bookCopies.status, deletedAt: books.deletedAt })
        .from(bookCopies)
        .innerJoin(books, eq(books.id, bookCopies.bookId))
        .where(eq(bookCopies.barcode, input.barcode))
        .for('update', { of: bookCopies });
      if (!copy || copy.deletedAt) throw notFound(`No copy has the barcode ${input.barcode}`);
      if (copy.status === 'held') {
        const [mine] = await tx
          .select({ id: holds.id })
          .from(holds)
          .where(
            and(eq(holds.copyId, copy.id), eq(holds.memberId, memberId), eq(holds.status, 'ready')),
          )
          .for('update');
        if (!mine) {
          throw conflict(
            'copy-held',
            'Copy is held for another member',
            'It is set aside at the desk for someone who reserved it',
          );
        }
        return { copyId: copy.id, holdId: mine.id };
      }
      if (copy.status !== 'available') {
        throw conflict('copy-unavailable', 'Copy is not available', `It is ${copy.status}`);
      }
      return { copyId: copy.id, holdId: null };
    }
    const [book] = await tx
      .select({ id: books.id })
      .from(books)
      .where(and(eq(books.id, input.bookId!), isNull(books.deletedAt)));
    if (!book) throw notFound(`Book ${input.bookId} does not exist`);
    const [reserved] = await tx
      .select({ id: holds.id, copyId: holds.copyId })
      .from(holds)
      .where(
        and(eq(holds.bookId, book.id), eq(holds.memberId, memberId), eq(holds.status, 'ready')),
      )
      .for('update');
    if (reserved?.copyId) {
      await tx
        .select({ id: bookCopies.id })
        .from(bookCopies)
        .where(eq(bookCopies.id, reserved.copyId))
        .for('update');
      return { copyId: reserved.copyId, holdId: reserved.id };
    }
    const [copy] = await tx
      .select({ id: bookCopies.id })
      .from(bookCopies)
      .where(and(eq(bookCopies.bookId, book.id), eq(bookCopies.status, 'available')))
      .orderBy(asc(bookCopies.barcode))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!copy) {
      throw conflict(
        'no-copy-available',
        'No copy is available',
        'Every copy is out or unavailable',
      );
    }
    return { copyId: copy.id, holdId: null };
  }

  private joined(executor: Pick<Database, 'select'>) {
    return executor
      .select(loanColumns)
      .from(loans)
      .innerJoin(members, eq(members.id, loans.memberId))
      .innerJoin(bookCopies, eq(bookCopies.id, loans.copyId))
      .innerJoin(books, eq(books.id, bookCopies.bookId));
  }

  private async readLoan(executor: Pick<Database, 'select'>, id: string): Promise<LoanDto> {
    const [row] = await this.joined(executor).where(eq(loans.id, id));
    if (!row) throw notFound(`Loan ${id} does not exist`);
    return toLoanDto(row);
  }
}
