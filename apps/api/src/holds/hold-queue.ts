import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { recordAudit } from '../common/audit.js';
import type { Tx } from '../db/db.module.js';
import { bookCopies, books, holds, members, outboxEvents } from '../db/schema.js';
import { addDays, POLICY } from '../circulation/policy.js';

/**
 * The hold queue is only ever changed through these functions, always inside the caller's
 * transaction and always after `lockBook`, so one book's queue is touched by one writer at a time
 * (a copy coming back and a member joining the queue can never miss each other).
 */
export async function lockBook(tx: Tx, bookId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, bookId))
    .for('update');
  return rows.length > 0;
}

/**
 * Give every available copy of the book to the member who has waited longest. A suspended or
 * deleted member keeps their place but is passed over until they are active again.
 */
export async function fillHolds(tx: Tx, bookId: string, actor: string): Promise<void> {
  for (;;) {
    const [hold] = await tx
      .select({ id: holds.id, memberId: holds.memberId })
      .from(holds)
      .innerJoin(members, eq(members.id, holds.memberId))
      .where(
        and(
          eq(holds.bookId, bookId),
          eq(holds.status, 'waiting'),
          eq(members.status, 'active'),
          isNull(members.deletedAt),
        ),
      )
      .orderBy(asc(holds.placedAt), asc(holds.id))
      .limit(1)
      .for('update', { of: holds });
    if (!hold) return;

    const [copy] = await tx
      .select({ id: bookCopies.id, barcode: bookCopies.barcode })
      .from(bookCopies)
      .where(and(eq(bookCopies.bookId, bookId), eq(bookCopies.status, 'available')))
      .orderBy(asc(bookCopies.barcode))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!copy) return;

    const now = new Date();
    const expiresAt = addDays(now, POLICY.holdPickupDays);
    await tx
      .update(bookCopies)
      .set({ status: 'held', version: sql`${bookCopies.version} + 1`, updatedAt: sql`now()` })
      .where(eq(bookCopies.id, copy.id));
    await tx
      .update(holds)
      .set({
        status: 'ready',
        copyId: copy.id,
        readyAt: now,
        expiresAt,
        version: sql`${holds.version} + 1`,
      })
      .where(eq(holds.id, hold.id));
    await recordAudit(tx, {
      actor,
      action: 'hold.ready',
      entityType: 'hold',
      entityId: hold.id,
      after: { copyId: copy.id, barcode: copy.barcode, expiresAt: expiresAt.toISOString() },
    });
    await tx.insert(outboxEvents).values({
      topic: 'hold.ready',
      payload: {
        holdId: hold.id,
        memberId: hold.memberId,
        bookId,
        barcode: copy.barcode,
        expiresAt: expiresAt.toISOString(),
      },
    });
  }
}

/**
 * Release holds whose pickup time has passed: the copy goes back on the shelf and straight to the
 * next member in line. Safe to call often; a hold is expired exactly once.
 */
export async function expireStaleHolds(tx: Tx, actor = 'system'): Promise<number> {
  const stale = await tx
    .select({ id: holds.id, bookId: holds.bookId })
    .from(holds)
    .where(and(eq(holds.status, 'ready'), lt(holds.expiresAt, new Date())))
    .orderBy(asc(holds.expiresAt));
  let expired = 0;
  for (const { id, bookId } of stale) {
    await lockBook(tx, bookId);
    const [hold] = await tx
      .select()
      .from(holds)
      .where(and(eq(holds.id, id), eq(holds.status, 'ready'), lt(holds.expiresAt, new Date())))
      .for('update');
    if (!hold) continue;
    await tx
      .update(holds)
      .set({ status: 'expired', closedAt: new Date(), version: sql`${holds.version} + 1` })
      .where(eq(holds.id, id));
    if (hold.copyId) {
      await tx
        .update(bookCopies)
        .set({
          status: 'available',
          version: sql`${bookCopies.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(bookCopies.id, hold.copyId), eq(bookCopies.status, 'held')));
    }
    await recordAudit(tx, {
      actor,
      action: 'hold.expired',
      entityType: 'hold',
      entityId: id,
      before: { status: 'ready', copyId: hold.copyId },
    });
    await tx.insert(outboxEvents).values({
      topic: 'hold.expired',
      payload: { holdId: id, memberId: hold.memberId, bookId },
    });
    await fillHolds(tx, bookId, actor);
    expired += 1;
  }
  return expired;
}

/**
 * Close every live hold of a book or a member (the book was removed, the member left). Copies set
 * aside for them go back on the shelf; `refill` then offers those copies to whoever is next, which
 * a removed book must not do because its copies are being withdrawn.
 */
export async function cancelLiveHolds(
  tx: Tx,
  scope: { bookId: string } | { memberId: string },
  actor: string,
  reason: string,
  options: { refill: boolean },
): Promise<void> {
  const where =
    'bookId' in scope ? eq(holds.bookId, scope.bookId) : eq(holds.memberId, scope.memberId);
  const live = await tx
    .select({ id: holds.id, bookId: holds.bookId })
    .from(holds)
    .where(and(where, inArray(holds.status, ['waiting', 'ready'])))
    .orderBy(asc(holds.placedAt));
  const books_ = new Set<string>();
  for (const { id, bookId } of live) {
    await lockBook(tx, bookId);
    const [hold] = await tx
      .select()
      .from(holds)
      .where(and(eq(holds.id, id), inArray(holds.status, ['waiting', 'ready'])))
      .for('update');
    if (!hold) continue;
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
    }
    await recordAudit(tx, {
      actor,
      action: 'hold.cancelled',
      entityType: 'hold',
      entityId: id,
      before: { status: hold.status },
      after: { status: 'cancelled', reason },
    });
    books_.add(bookId);
  }
  if (options.refill) for (const bookId of books_) await fillHolds(tx, bookId, actor);
}

/**
 * A held copy stops being held (it was lost or withdrawn): its member goes back to the front of
 * the queue they were in rather than losing their place.
 */
export async function resetReadyHold(tx: Tx, copyId: string, actor: string): Promise<void> {
  const [hold] = await tx
    .select()
    .from(holds)
    .where(and(eq(holds.copyId, copyId), eq(holds.status, 'ready')))
    .for('update');
  if (!hold) return;
  await tx
    .update(holds)
    .set({
      status: 'waiting',
      copyId: null,
      readyAt: null,
      expiresAt: null,
      version: sql`${holds.version} + 1`,
    })
    .where(eq(holds.id, hold.id));
  await recordAudit(tx, {
    actor,
    action: 'hold.reset',
    entityType: 'hold',
    entityId: hold.id,
    before: { status: 'ready', copyId },
    after: { status: 'waiting' },
  });
}
