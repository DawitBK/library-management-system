import { Inject, Injectable } from '@nestjs/common';
import { conflict, notFound, ProblemException, toPage } from '@library/kit';
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { recordAudit } from '../common/audit.js';
import type { Principal } from '../common/auth.js';
import { escapeLike, pgCode, versionConflict } from '../common/errors.js';
import { DB, type Database, type Tx } from '../db/db.module.js';
import { fines, loans, members, type MemberRow } from '../db/schema.js';
import { cancelLiveHolds } from '../holds/hold-queue.js';
import type {
  CreateMember,
  ListMembersQuery,
  MemberDetailDto,
  MemberDto,
  MemberSortField,
  UpdateMember,
} from './members.contract.js';

const SORT = {
  name: sql`lower(${members.name})`,
  cardNumber: members.cardNumber,
  createdAt: members.createdAt,
} satisfies Record<MemberSortField, unknown>;

export const toMemberDto = (row: MemberRow): MemberDto => ({
  id: row.id,
  cardNumber: row.cardNumber,
  name: row.name,
  email: row.email,
  phone: row.phone,
  status: row.status,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class MembersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(actor: Principal, input: CreateMember): Promise<MemberDto> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(members)
          .values({
            cardNumber: sql<string>`'LM-' || nextval('member_number_seq')`,
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
          })
          .returning();
        const after = toMemberDto(row!);
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'member.created',
          entityType: 'member',
          entityId: after.id,
          after,
        });
        return after;
      });
    } catch (e) {
      throw emailConflict(e);
    }
  }

  async list(query: ListMembersQuery) {
    const where: SQL[] = [isNull(members.deletedAt)];
    if (query.status) where.push(eq(members.status, query.status));
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      where.push(
        or(
          ilike(members.name, like),
          ilike(members.email, like),
          ilike(members.cardNumber, like),
        ) as SQL,
      );
    }
    const order = [
      ...query.sort.map((s) => (s.direction === 'asc' ? asc : desc)(SORT[s.field] as SQL)),
      asc(members.id),
    ];
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(members)
        .where(and(...where))
        .orderBy(...order)
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: count() })
        .from(members)
        .where(and(...where)),
    ]);
    return toPage(rows.map(toMemberDto), totals[0]?.total ?? 0, query);
  }

  async get(id: string): Promise<MemberDetailDto> {
    const [row] = await this.db
      .select()
      .from(members)
      .where(and(eq(members.id, id), isNull(members.deletedAt)));
    if (!row) throw notFound(`Member ${id} does not exist`);
    const standing = await memberStanding(this.db, id);
    return { ...toMemberDto(row), ...standing };
  }

  async update(actor: Principal, id: string, input: UpdateMember): Promise<MemberDto> {
    try {
      return await this.db.transaction(async (tx) => {
        const current = await this.lockLive(tx, id);
        if (current.version !== input.version) {
          throw versionConflict('member', current.version, input.version);
        }
        const changes: Partial<UpdateMember> = { ...input };
        delete changes.version; // compared above and bumped below, never written directly
        const [row] = await tx
          .update(members)
          .set({ ...changes, version: sql`${members.version} + 1`, updatedAt: sql`now()` })
          .where(eq(members.id, id))
          .returning();
        const after = toMemberDto(row!);
        await recordAudit(tx, {
          actor: actor.userId,
          action: 'member.updated',
          entityType: 'member',
          entityId: id,
          before: toMemberDto(current),
          after,
        });
        return after;
      });
    } catch (e) {
      throw emailConflict(e);
    }
  }

  /** Remove a member record. Refused while they hold books or owe fines. */
  async remove(actor: Principal, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = await this.lockLive(tx, id);
      const standing = await memberStanding(tx, id);
      if (standing.openLoans > 0 || standing.unpaidFinesMinor > 0) {
        throw conflict(
          'member-has-obligations',
          'Member still has loans or fines',
          `${standing.openLoans} open loans, ${standing.unpaidFinesMinor} minor units owed`,
        );
      }
      await cancelLiveHolds(tx, { memberId: id }, actor.userId, 'member removed', { refill: true });
      await tx
        .update(members)
        .set({ deletedAt: sql`now()`, version: sql`${members.version} + 1`, updatedAt: sql`now()` })
        .where(eq(members.id, id));
      await recordAudit(tx, {
        actor: actor.userId,
        action: 'member.deleted',
        entityType: 'member',
        entityId: id,
        before: toMemberDto(current),
      });
    });
  }

  private async lockLive(tx: Tx, id: string): Promise<MemberRow> {
    const [row] = await tx
      .select()
      .from(members)
      .where(and(eq(members.id, id), isNull(members.deletedAt)))
      .for('update');
    if (!row) throw notFound(`Member ${id} does not exist`);
    return row;
  }
}

/** How many books a member holds and how much they owe. Used by lending and by deletion. */
export async function memberStanding(
  executor: Pick<Database, 'select'>,
  memberId: string,
): Promise<{ openLoans: number; unpaidFinesMinor: number }> {
  const [open] = await executor
    .select({ n: count() })
    .from(loans)
    .where(and(eq(loans.memberId, memberId), isNull(loans.returnedAt)));
  const [owed] = await executor
    .select({ sum: sql<number>`coalesce(sum(${fines.amountMinor}), 0)::bigint` })
    .from(fines)
    .where(and(eq(fines.memberId, memberId), isNull(fines.paidAt), isNull(fines.waivedAt)));
  return { openLoans: open?.n ?? 0, unpaidFinesMinor: Number(owed?.sum ?? 0) };
}

function emailConflict(error: unknown): unknown {
  if (error instanceof ProblemException) return error;
  if (pgCode(error) === '23505') {
    return conflict('email-taken', 'A member with this email already exists');
  }
  return error;
}
