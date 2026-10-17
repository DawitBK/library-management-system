import { pageSchema, paginationQuerySchema, sortQuerySchema } from '@library/kit';
import { z } from 'zod';

export const idParamsSchema = z.object({ id: z.uuid() });

export const idempotencyHeaderSchema = z.object({
  'idempotency-key': z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Replays the stored response when the same key is sent again'),
});

export const loanSchema = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  memberName: z.string(),
  copyId: z.uuid(),
  barcode: z.string(),
  bookId: z.uuid(),
  bookTitle: z.string(),
  borrowedAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  returnedAt: z.iso.datetime().nullable(),
  renewals: z.number().int().min(0),
  overdue: z.boolean(),
  daysOverdue: z.number().int().min(0),
});
export type LoanDto = z.output<typeof loanSchema>;

/** Lend by book (any available copy is picked) or by the barcode of a specific copy. */
export const createLoanSchema = z
  .object({
    memberId: z.uuid(),
    bookId: z.uuid().optional(),
    barcode: z.string().trim().min(1).max(40).optional(),
  })
  .strict()
  .refine((v) => (v.bookId === undefined) !== (v.barcode === undefined), {
    message: 'Provide exactly one of bookId or barcode',
  });
export type CreateLoan = z.output<typeof createLoanSchema>;

export const fineSchema = z.object({
  id: z.uuid(),
  loanId: z.uuid(),
  memberId: z.uuid(),
  amountMinor: z.number().int().min(1),
  status: z.enum(['unpaid', 'paid', 'waived']),
  waiveReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type FineDto = z.output<typeof fineSchema>;

export const returnResultSchema = z.object({ loan: loanSchema, fine: fineSchema.nullable() });
export type ReturnResult = z.output<typeof returnResultSchema>;

export const LOAN_SORT_FIELDS = ['borrowedAt', 'dueAt'] as const;
export const listLoansQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'returned', 'overdue']).optional(),
  memberId: z.uuid().optional(),
  sort: sortQuerySchema(LOAN_SORT_FIELDS, [{ field: 'borrowedAt', direction: 'desc' }]),
});
export type ListLoansQuery = z.output<typeof listLoansQuerySchema>;
export const loanPageSchema = pageSchema(loanSchema);

export const listFinesQuerySchema = paginationQuerySchema.extend({
  memberId: z.uuid().optional(),
  status: z.enum(['unpaid', 'paid', 'waived']).optional(),
});
export type ListFinesQuery = z.output<typeof listFinesQuerySchema>;
export const finePageSchema = pageSchema(fineSchema);

export const waiveFineSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type WaiveFine = z.output<typeof waiveFineSchema>;

export const popularGenresQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type PopularGenresQuery = z.output<typeof popularGenresQuerySchema>;
export const popularGenreSchema = z.object({
  genreId: z.uuid(),
  genre: z.string(),
  loans: z.number().int().min(0),
});

export const summarySchema = z.object({
  titles: z.number().int(),
  copies: z.number().int(),
  availableCopies: z.number().int(),
  members: z.number().int(),
  openLoans: z.number().int(),
  overdueLoans: z.number().int(),
  unpaidFinesMinor: z.number().int(),
});
export type Summary = z.output<typeof summarySchema>;
