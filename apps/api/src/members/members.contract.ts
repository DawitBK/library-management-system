import { pageSchema, paginationQuerySchema, sortQuerySchema } from '@library/kit';
import { z } from 'zod';
import { MEMBER_STATUSES } from '../db/schema.js';

export const idParamsSchema = z.object({ id: z.uuid() });

const name = z.string().trim().min(1).max(200);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,20}$/, 'Not a plausible phone number');

export const memberSchema = z.object({
  id: z.uuid(),
  cardNumber: z.string().describe('Printed on the library card and scanned at the desk'),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: z.enum(MEMBER_STATUSES),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MemberDto = z.output<typeof memberSchema>;

export const memberDetailSchema = memberSchema.extend({
  openLoans: z.number().int().min(0),
  unpaidFinesMinor: z.number().int().min(0),
});
export type MemberDetailDto = z.output<typeof memberDetailSchema>;

export const createMemberSchema = z.object({ name, email, phone: phone.optional() }).strict();
export type CreateMember = z.output<typeof createMemberSchema>;

export const updateMemberSchema = z
  .object({
    version: z.number().int().min(1).describe('The version you last read; a mismatch returns 409'),
    name: name.optional(),
    email: email.optional(),
    phone: phone.nullable().optional(),
    status: z.enum(MEMBER_STATUSES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), {
    message: 'Provide at least one field to change',
  });
export type UpdateMember = z.output<typeof updateMemberSchema>;

export const MEMBER_SORT_FIELDS = ['name', 'cardNumber', 'createdAt'] as const;
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];

export const listMembersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional().describe('Name, email or card number'),
  status: z.enum(MEMBER_STATUSES).optional(),
  sort: sortQuerySchema(MEMBER_SORT_FIELDS, [{ field: 'name', direction: 'asc' }]),
});
export type ListMembersQuery = z.output<typeof listMembersQuerySchema>;
export const memberPageSchema = pageSchema(memberSchema);
