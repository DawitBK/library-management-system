import { Inject, Injectable } from '@nestjs/common';
import { conflict, notFound, ProblemException, toPage, unprocessable } from '@library/kit';
import type { Pagination } from '@library/kit';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { recordAudit } from '../common/audit.js';
import type { Principal } from '../common/auth.js';
import { escapeLike, pgCode, versionConflict } from '../common/errors.js';
import { DB, type Database, type Tx } from '../db/db.module.js';
import { cancelLiveHolds, fillHolds, lockBook, resetReadyHold } from '../holds/hold-queue.js';
import {
  bookCopies,
  books,
  genres,
  loans,
  type BookRow,
  type CopyRow,
  type GenreRow,
} from '../db/schema.js';
import type {
  AddCopies,
  BookDto,
  BookSortField,
  CopyDto,
  CreateBook,
  CreateGenre,
  ListBooksQuery,
  SetCopyStatus,
  UpdateBook,
  UpdateGenre,
} from './catalog.contract.js';

const BOOK_SORT = {
  title: sql`lower(${books.title})`,
  publishedYear: books.publishedYear,
  createdAt: books.createdAt,
} satisfies Record<BookSortField, unknown>;

export const toGenreDto = (row: GenreRow) => ({
  id: row.id,
  name: row.name,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toCopyDto = (row: CopyRow): CopyDto => ({
  id: row.id,
  bookId: row.bookId,
  barcode: row.barcode,
  status: row.status,
  version: row.version,
});

const toBookDto = (
  row: BookRow,
  genreName: string,
  totalCopies: number,
  availableCopies: number,
): BookDto => ({
  id: row.id,
  isbn: row.isbn,
  title: row.title,
  authors: row.authors,
  publishedYear: row.publishedYear,
  genreId: row.genreId,
  genreName,
  description: row.description,
  totalCopies,
  availableCopies,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const touch = () => ({ version: sql`version + 1`, updatedAt: sql`now()` });

const totalExpr = sql<number>`(select count(*)::int from book_copies c where c.book_id = ${books.id} and c.status <> 'withdrawn')`;
const availableExpr = sql<number>`(select count(*)::int from book_copies c where c.book_id = ${books.id} and c.status = 'available')`;

@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // ---------- genres ----------

  async listGenres(page: Pagination) {
    const where = isNull(genres.deletedAt);
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(genres)
        .where(where)
        .orderBy(asc(genres.name), asc(genres.id))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ total: count() }).from(genres).where(where),
    ]);
    return toPage(rows.map(toGenreDto), totals[0]?.total ?? 0, page);
  }

  async createGenre(actor: Principal, input: CreateGenre) {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(genres).values({ name: input.name }).returning();
        const after = toGenreDto(row!);
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'genre.created',
          entityType: 'genre',
          entityId: after.id,
          after,
        });
        return after;
      });
    } catch (e) {
      throw nameConflict(e);
    }
  }

  async updateGenre(actor: Principal, id: string, input: UpdateGenre) {
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(genres)
          .where(and(eq(genres.id, id), isNull(genres.deletedAt)))
          .for('update');
        if (!current) throw notFound(`Genre ${id} does not exist`);
        if (current.version !== input.version) {
          throw versionConflict('genre', current.version, input.version);
        }
        const [row] = await tx
          .update(genres)
          .set({ name: input.name, ...touch() })
          .where(eq(genres.id, id))
          .returning();
        const after = toGenreDto(row!);
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'genre.updated',
          entityType: 'genre',
          entityId: id,
          before: toGenreDto(current),
          after,
        });
        return after;
      });
    } catch (e) {
      throw nameConflict(e);
    }
  }

  async deleteGenre(actor: Principal, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(genres)
        .where(and(eq(genres.id, id), isNull(genres.deletedAt)))
        .for('update');
      if (!current) throw notFound(`Genre ${id} does not exist`);
      const [{ items } = { items: 0 }] = await tx
        .select({ items: count() })
        .from(books)
        .where(and(eq(books.genreId, id), isNull(books.deletedAt)));
      if (items > 0) {
        throw conflict('genre-in-use', 'Genre is in use', `It still has ${items} books`);
      }
      await tx
        .update(genres)
        .set({ deletedAt: sql`now()`, ...touch() })
        .where(eq(genres.id, id));
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'genre.deleted',
        entityType: 'genre',
        entityId: id,
        before: toGenreDto(current),
      });
    });
  }

  // ---------- books ----------

  async listBooks(query: ListBooksQuery) {
    const where: SQL[] = [isNull(books.deletedAt)];
    if (query.genreId) where.push(eq(books.genreId, query.genreId));
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      const digits = query.q.replace(/[\s-]/g, '');
      where.push(
        or(
          ilike(books.title, like),
          sql`array_to_string(${books.authors}, ' ') ilike ${like}`,
          eq(books.isbn, digits.toUpperCase()),
        ) as SQL,
      );
    }
    if (query.availableOnly) {
      where.push(
        sql`exists (select 1 from book_copies c where c.book_id = ${books.id} and c.status = 'available')`,
      );
    }
    const order = [
      ...query.sort.map((s) => (s.direction === 'asc' ? asc : desc)(BOOK_SORT[s.field] as SQL)),
      asc(books.id), // deterministic tiebreaker keeps pages stable
    ];
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          book: books,
          genreName: genres.name,
          total: totalExpr,
          available: availableExpr,
        })
        .from(books)
        .innerJoin(genres, eq(genres.id, books.genreId))
        .where(and(...where))
        .orderBy(...order)
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: count() })
        .from(books)
        .where(and(...where)),
    ]);
    return toPage(
      rows.map((r) => toBookDto(r.book, r.genreName, r.total, r.available)),
      totals[0]?.total ?? 0,
      query,
    );
  }

  async getBook(id: string): Promise<BookDto> {
    return this.readBook(this.db, id);
  }

  async createBook(actor: Principal, input: CreateBook): Promise<BookDto> {
    try {
      return await this.db.transaction(async (tx) => {
        await this.requireGenre(tx, input.genreId);
        const [row] = await tx
          .insert(books)
          .values({
            isbn: input.isbn ?? null,
            title: input.title,
            authors: input.authors,
            publishedYear: input.publishedYear ?? null,
            genreId: input.genreId,
            description: input.description ?? null,
          })
          .returning();
        if (input.copies > 0) await this.insertCopies(tx, row!.id, input.copies);
        const after = await this.readBook(tx, row!.id);
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'book.created',
          entityType: 'book',
          entityId: after.id,
          after,
        });
        return after;
      });
    } catch (e) {
      throw isbnConflict(e);
    }
  }

  async updateBook(actor: Principal, id: string, input: UpdateBook): Promise<BookDto> {
    try {
      return await this.db.transaction(async (tx) => {
        const current = await this.lockLiveBook(tx, id);
        if (current.version !== input.version) {
          throw versionConflict('book', current.version, input.version);
        }
        if (input.genreId) await this.requireGenre(tx, input.genreId);
        const before = await this.readBook(tx, id);
        const changes: Partial<UpdateBook> = { ...input };
        delete changes.version; // compared above and bumped by touch(), never written directly
        await tx
          .update(books)
          .set({ ...changes, ...touch() })
          .where(eq(books.id, id));
        const after = await this.readBook(tx, id);
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'book.updated',
          entityType: 'book',
          entityId: id,
          before,
          after,
        });
        return after;
      });
    } catch (e) {
      throw isbnConflict(e);
    }
  }

  async deleteBook(actor: Principal, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = await this.lockLiveBook(tx, id);
      const [{ out } = { out: 0 }] = await tx
        .select({ out: count() })
        .from(bookCopies)
        .where(and(eq(bookCopies.bookId, id), eq(bookCopies.status, 'on_loan')));
      if (out > 0) {
        throw conflict(
          'book-on-loan',
          'Book has copies on loan',
          `${out} copies are out; wait for them to come back`,
        );
      }
      const before = await this.readBook(tx, id);
      await cancelLiveHolds(tx, { bookId: id }, actor.userId, 'book removed', { refill: false });
      await tx
        .update(bookCopies)
        .set({ status: 'withdrawn', ...touch() })
        .where(eq(bookCopies.bookId, id));
      await tx
        .update(books)
        .set({ deletedAt: sql`now()`, ...touch() })
        .where(eq(books.id, current.id));
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'book.deleted',
        entityType: 'book',
        entityId: id,
        before,
      });
    });
  }

  // ---------- copies ----------

  async listCopies(bookId: string): Promise<CopyDto[]> {
    await this.getBook(bookId);
    const rows = await this.db
      .select()
      .from(bookCopies)
      .where(eq(bookCopies.bookId, bookId))
      .orderBy(asc(bookCopies.barcode));
    return rows.map(toCopyDto);
  }

  async addCopies(actor: Principal, bookId: string, input: AddCopies): Promise<CopyDto[]> {
    return this.db.transaction(async (tx) => {
      await this.lockLiveBook(tx, bookId);
      const inserted = await this.insertCopies(tx, bookId, input.count);
      // New copies go straight to members already waiting for this book.
      await fillHolds(tx, bookId, actor.userId);
      const fresh = await tx
        .select()
        .from(bookCopies)
        .where(
          inArray(
            bookCopies.id,
            inserted.map((c) => c.id),
          ),
        );
      const created = fresh.map(toCopyDto).sort((x, y) => x.barcode.localeCompare(y.barcode));
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'book.copies-added',
        entityType: 'book',
        entityId: bookId,
        after: created.map((c) => c.barcode),
      });
      return created;
    });
  }

  /** Mark a copy lost, withdrawn, or back on the shelf. A copy that is out on loan cannot be touched. */
  async setCopyStatus(actor: Principal, copyId: string, input: SetCopyStatus): Promise<CopyDto> {
    return this.db.transaction(async (tx) => {
      const [probe] = await tx
        .select({ bookId: bookCopies.bookId })
        .from(bookCopies)
        .where(eq(bookCopies.id, copyId));
      if (!probe) throw notFound(`Copy ${copyId} does not exist`);
      await lockBook(tx, probe.bookId);
      const [current] = await tx
        .select()
        .from(bookCopies)
        .where(eq(bookCopies.id, copyId))
        .for('update');
      if (!current) throw notFound(`Copy ${copyId} does not exist`);
      if (current.version !== input.version) {
        throw versionConflict('copy', current.version, input.version);
      }
      if (current.status === 'on_loan') {
        throw conflict('copy-on-loan', 'Copy is on loan', 'Return it before changing its status');
      }
      const [open] = await tx
        .select({ id: loans.id })
        .from(loans)
        .where(and(eq(loans.copyId, copyId), isNull(loans.returnedAt)));
      if (open) throw conflict('copy-on-loan', 'Copy is on loan');
      const [row] = await tx
        .update(bookCopies)
        .set({ status: input.status, ...touch() })
        .where(eq(bookCopies.id, copyId))
        .returning();
      // A copy that was set aside for a member leaves their hold waiting, and a copy that is back on
      // the shelf goes to whoever has waited longest.
      if (current.status === 'held') await resetReadyHold(tx, copyId, actor.userId);
      await fillHolds(tx, current.bookId, actor.userId);
      const [settled] = await tx.select().from(bookCopies).where(eq(bookCopies.id, copyId));
      const after = toCopyDto(settled ?? row!);
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'copy.status-set',
        entityType: 'copy',
        entityId: copyId,
        before: toCopyDto(current),
        after,
      });
      return after;
    });
  }

  // ---------- helpers ----------

  private async readBook(executor: Pick<Database, 'select'>, id: string): Promise<BookDto> {
    const [r] = await executor
      .select({ book: books, genreName: genres.name, total: totalExpr, available: availableExpr })
      .from(books)
      .innerJoin(genres, eq(genres.id, books.genreId))
      .where(and(eq(books.id, id), isNull(books.deletedAt)));
    if (!r) throw notFound(`Book ${id} does not exist`);
    return toBookDto(r.book, r.genreName, r.total, r.available);
  }

  private async lockLiveBook(tx: Tx, id: string): Promise<BookRow> {
    const [row] = await tx
      .select()
      .from(books)
      .where(and(eq(books.id, id), isNull(books.deletedAt)))
      .for('update');
    if (!row) throw notFound(`Book ${id} does not exist`);
    return row;
  }

  private async requireGenre(tx: Tx, id: string): Promise<void> {
    const [row] = await tx
      .select({ id: genres.id })
      .from(genres)
      .where(and(eq(genres.id, id), isNull(genres.deletedAt)));
    if (!row) throw unprocessable('genre-missing', 'Genre does not exist', `Genre ${id}`);
  }

  private async insertCopies(tx: Tx, bookId: string, n: number): Promise<CopyDto[]> {
    const rows = await tx
      .insert(bookCopies)
      .values(
        Array.from({ length: n }, () => ({
          bookId,
          barcode: sql<string>`'LB-' || nextval('copy_barcode_seq')`,
        })),
      )
      .returning();
    return rows.map(toCopyDto).sort((a, b) => a.barcode.localeCompare(b.barcode));
  }
}

function nameConflict(error: unknown): unknown {
  if (error instanceof ProblemException) return error;
  if (pgCode(error) === '23505') return conflict('name-taken', 'A genre with this name exists');
  return error;
}

function isbnConflict(error: unknown): unknown {
  if (error instanceof ProblemException) return error;
  if (pgCode(error) === '23505') {
    return conflict('isbn-taken', 'A book with this ISBN is already catalogued');
  }
  return error;
}
