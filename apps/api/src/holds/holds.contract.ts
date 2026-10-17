import { pageSchema, paginationQuerySchema } from '@library/kit';
import { z } from 'zod';
import { HOLD_STATUSES } from '../db/schema.js';

export const idParamsSchema = z.object({ id: z.uuid() });

export const holdSchema = z.object({
  id: z.uuid(),
  bookId: z.uuid(),
  bookTitle: z.string(),
  memberId: z.uuid(),
  memberName: z.string(),
  status: z.enum(HOLD_STATUSES),
  placedAt: z.iso.datetime(),
  queuePosition: z
    .number()
    .int()
    .min(1)
    .nullable()
    .describe('Place in the queue while waiting (1 is next); null once ready or closed'),
  barcode: z
    .string()
    .nullable()
    .describe('The copy set aside, once the hold is ready or fulfilled'),
  readyAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable().describe('Pickup deadline for a ready hold'),
  closedAt: z.iso.datetime().nullable(),
  fulfilledLoanId: z.uuid().nullable(),
});
export type HoldDto = z.output<typeof holdSchema>;

export const placeHoldSchema = z.object({ memberId: z.uuid(), bookId: z.uuid() }).strict();
export type PlaceHold = z.output<typeof placeHoldSchema>;

export const listHoldsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(HOLD_STATUSES).optional(),
  memberId: z.uuid().optional(),
  bookId: z.uuid().optional(),
});
export type ListHoldsQuery = z.output<typeof listHoldsQuerySchema>;
export const holdPageSchema = pageSchema(holdSchema);

export const processResultSchema = z.object({ expired: z.number().int().min(0) });
