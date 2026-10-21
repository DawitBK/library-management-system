import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Staff roles. Members of the library do not sign in; they are records, not accounts. */
export const ROLES = ['librarian', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const COPY_STATUSES = ['available', 'held', 'on_loan', 'lost', 'withdrawn'] as const;
export const HOLD_STATUSES = ['waiting', 'ready', 'fulfilled', 'cancelled', 'expired'] as const;
export const MEMBER_STATUSES = ['active', 'suspended'] as const;

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const deletedAt = () => timestamp('deleted_at', { withTimezone: true });
/** Optimistic concurrency token: bumped by every update. */
const version = () => integer('version').notNull().default(1);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    role: text('role', { enum: ROLES }).notNull().default('librarian'),
    /** A disabled account cannot sign in and its refresh tokens are revoked. */
    active: boolean('active').notNull().default(true),
    /** The identity provider's id for this person ("sub"), bound at the first single sign-on; it is how a sign-out at the provider finds the account. */
    ssoSubject: text('sso_subject'),
    /** The platform administrator's account: in no staff list and out of reach of every other user (answers like an id that was never there). */
    platformAdmin: boolean('platform_admin').notNull().default(false),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('users_role_valid', sql`${t.role} in ('librarian', 'admin')`),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    uniqueIndex('users_email_live_uq')
      .on(t.email)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex('users_sso_subject_uq')
      .on(t.ssoSubject)
      .where(sql`${t.ssoSubject} is not null`),
  ],
);

/** One row per issued refresh token; only the SHA-256 of the token is stored. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** All tokens descended from one login share a family; reuse of a spent token revokes it. */
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash),
    index('refresh_tokens_family_idx').on(t.familyId),
    index('refresh_tokens_user_idx').on(t.userId),
  ],
);

export const genres = pgTable(
  'genres',
  {
    id: id(),
    name: text('name').notNull(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('genres_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    uniqueIndex('genres_name_live_uq')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const books = pgTable(
  'books',
  {
    id: id(),
    isbn: text('isbn'),
    title: text('title').notNull(),
    authors: text('authors').array().notNull(),
    publishedYear: integer('published_year'),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id),
    description: text('description'),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('books_title_not_blank', sql`length(btrim(${t.title})) > 0`),
    check('books_has_author', sql`cardinality(${t.authors}) >= 1`),
    check(
      'books_year_plausible',
      sql`${t.publishedYear} is null or ${t.publishedYear} between 1000 and 2100`,
    ),
    uniqueIndex('books_isbn_live_uq')
      .on(t.isbn)
      .where(sql`${t.deletedAt} is null and ${t.isbn} is not null`),
    index('books_genre_idx').on(t.genreId),
    index('books_title_idx').on(sql`lower(${t.title})`),
  ],
);

export const barcodeSeq = pgSequence('copy_barcode_seq', { startWith: 100000 });

/** A physical copy of a book. Circulation works on copies; `books` is the catalogue record. */
export const bookCopies = pgTable(
  'book_copies',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    barcode: text('barcode').notNull(),
    status: text('status', { enum: COPY_STATUSES }).notNull().default('available'),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'book_copies_status_valid',
      sql`${t.status} in ('available', 'held', 'on_loan', 'lost', 'withdrawn')`,
    ),
    uniqueIndex('book_copies_barcode_uq').on(t.barcode),
    index('book_copies_book_status_idx').on(t.bookId, t.status),
  ],
);

export const memberNumberSeq = pgSequence('member_number_seq', { startWith: 1000 });

export const members = pgTable(
  'members',
  {
    id: id(),
    cardNumber: text('card_number').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    status: text('status', { enum: MEMBER_STATUSES }).notNull().default('active'),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('members_status_valid', sql`${t.status} in ('active', 'suspended')`),
    check('members_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('members_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    uniqueIndex('members_card_uq').on(t.cardNumber),
    uniqueIndex('members_email_live_uq')
      .on(t.email)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const loans = pgTable(
  'loans',
  {
    id: id(),
    copyId: uuid('copy_id')
      .notNull()
      .references(() => bookCopies.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    borrowedAt: timestamp('borrowed_at', { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    renewals: integer('renewals').notNull().default(0),
    issuedBy: uuid('issued_by')
      .notNull()
      .references(() => users.id),
    version: version(),
  },
  (t) => [
    check('loans_renewals_non_negative', sql`${t.renewals} >= 0`),
    check('loans_due_after_borrow', sql`${t.dueAt} > ${t.borrowedAt}`),
    // The database refuses a second open loan on one copy, whatever the application does.
    uniqueIndex('loans_one_open_per_copy')
      .on(t.copyId)
      .where(sql`${t.returnedAt} is null`),
    index('loans_member_idx').on(t.memberId, t.borrowedAt),
    index('loans_open_due_idx')
      .on(t.dueAt)
      .where(sql`${t.returnedAt} is null`),
  ],
);

/** A fine is charged once per loan, in minor units, when an overdue book comes back. */
export const fines = pgTable(
  'fines',
  {
    id: id(),
    loanId: uuid('loan_id')
      .notNull()
      .references(() => loans.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    waivedAt: timestamp('waived_at', { withTimezone: true }),
    waivedBy: uuid('waived_by').references(() => users.id),
    waiveReason: text('waive_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    check('fines_amount_positive', sql`${t.amountMinor} > 0`),
    check('fines_settled_once', sql`not (${t.paidAt} is not null and ${t.waivedAt} is not null)`),
    uniqueIndex('fines_one_per_loan').on(t.loanId),
    index('fines_member_open_idx')
      .on(t.memberId)
      .where(sql`${t.paidAt} is null and ${t.waivedAt} is null`),
  ],
);

/**
 * A member's place in the queue for a book whose copies are all out. When a copy comes back the
 * oldest waiting hold becomes `ready` and the copy is `held` for that member until `expires_at`.
 */
export const holds = pgTable(
  'holds',
  {
    id: id(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    status: text('status', { enum: HOLD_STATUSES }).notNull().default('waiting'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    /** The copy set aside for the member; set while the hold is `ready` and kept once `fulfilled`. */
    copyId: uuid('copy_id').references(() => bookCopies.id),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    fulfilledLoanId: uuid('fulfilled_loan_id').references(() => loans.id),
    placedBy: uuid('placed_by')
      .notNull()
      .references(() => users.id),
    version: version(),
  },
  (t) => [
    check(
      'holds_status_valid',
      sql`${t.status} in ('waiting', 'ready', 'fulfilled', 'cancelled', 'expired')`,
    ),
    // The state names what must be present, so a half-updated hold cannot be stored.
    check(
      'holds_ready_shape',
      sql`${t.status} <> 'ready' or (${t.copyId} is not null and ${t.expiresAt} is not null and ${t.closedAt} is null)`,
    ),
    check(
      'holds_waiting_shape',
      sql`${t.status} <> 'waiting' or (${t.copyId} is null and ${t.readyAt} is null and ${t.closedAt} is null)`,
    ),
    check(
      'holds_closed_shape',
      sql`${t.status} in ('waiting', 'ready') or ${t.closedAt} is not null`,
    ),
    // One live hold per member and book, and one ready hold per copy, whatever the application does.
    uniqueIndex('holds_one_live_per_member_book')
      .on(t.memberId, t.bookId)
      .where(sql`${t.status} in ('waiting', 'ready')`),
    uniqueIndex('holds_one_ready_per_copy')
      .on(t.copyId)
      .where(sql`${t.status} = 'ready'`),
    index('holds_queue_idx')
      .on(t.bookId, t.placedAt)
      .where(sql`${t.status} = 'waiting'`),
    index('holds_member_idx').on(t.memberId, t.placedAt),
  ],
);

/** Append-only: a trigger (migration 0001) rejects UPDATE and DELETE. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entityType, t.entityId)],
);

/** Stored response for a POST that carried an `Idempotency-Key`. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid('user_id').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Transactional outbox: a row is written in the same transaction as the change it announces. */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    index('outbox_unprocessed_idx')
      .on(t.createdAt)
      .where(sql`${t.processedAt} is null`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type GenreRow = typeof genres.$inferSelect;
export type BookRow = typeof books.$inferSelect;
export type CopyRow = typeof bookCopies.$inferSelect;
export type MemberRow = typeof members.$inferSelect;
export type LoanRow = typeof loans.$inferSelect;
export type FineRow = typeof fines.$inferSelect;
export type HoldRow = typeof holds.$inferSelect;
