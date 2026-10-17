import { pageSchema, paginationQuerySchema, sortQuerySchema } from '@library/kit';
import { z } from 'zod';
import { COPY_STATUSES } from '../db/schema.js';
import { normalizeIsbn } from './isbn.js';

export const idParamsSchema = z.object({ id: z.uuid() });

const name = z.string().trim().min(1).max(200);
const versionField = z
  .number()
  .int()
  .min(1)
  .describe('The version you last read; a mismatch returns 409');

// ---- genres ----

export const genreSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type GenreDto = z.output<typeof genreSchema>;
export const createGenreSchema = z.object({ name }).strict();
export type CreateGenre = z.output<typeof createGenreSchema>;
export const updateGenreSchema = z.object({ version: versionField, name }).strict();
export type UpdateGenre = z.output<typeof updateGenreSchema>;
export const genrePageSchema = pageSchema(genreSchema);

// ---- books ----

const isbn = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeIsbn(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Not a valid ISBN-10 or ISBN-13' });
      return z.NEVER;
    }
    return normalized;
  });
const authors = z.array(z.string().trim().min(1).max(200)).min(1).max(10);

export const bookSchema = z.object({
  id: z.uuid(),
  isbn: z.string().nullable(),
  title: z.string(),
  authors: z.array(z.string()),
  publishedYear: z.number().int().nullable(),
  genreId: z.uuid(),
  genreName: z.string(),
  description: z.string().nullable(),
  totalCopies: z.number().int().min(0).describe('Copies in circulation (not withdrawn)'),
  availableCopies: z.number().int().min(0).describe('Copies on the shelf right now'),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BookDto = z.output<typeof bookSchema>;

export const createBookSchema = z
  .object({
    isbn: isbn.optional(),
    title: name,
    authors,
    publishedYear: z.number().int().min(1000).max(2100).optional(),
    genreId: z.uuid(),
    description: z.string().trim().min(1).max(5000).optional(),
    copies: z.number().int().min(0).max(100).default(1).describe('Physical copies to register'),
  })
  .strict();
export type CreateBook = z.output<typeof createBookSchema>;

export const updateBookSchema = z
  .object({
    version: versionField,
    isbn: isbn.nullable().optional(),
    title: name.optional(),
    authors: authors.optional(),
    publishedYear: z.number().int().min(1000).max(2100).nullable().optional(),
    genreId: z.uuid().optional(),
    description: z.string().trim().min(1).max(5000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), {
    message: 'Provide at least one field to change',
  });
export type UpdateBook = z.output<typeof updateBookSchema>;

export const BOOK_SORT_FIELDS = ['title', 'publishedYear', 'createdAt'] as const;
export type BookSortField = (typeof BOOK_SORT_FIELDS)[number];

const boolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

export const listBooksQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional().describe('Title, author or ISBN'),
  genreId: z.uuid().optional(),
  availableOnly: boolean.describe('Only books with a copy on the shelf'),
  sort: sortQuerySchema(BOOK_SORT_FIELDS, [{ field: 'title', direction: 'asc' }]),
});
export type ListBooksQuery = z.output<typeof listBooksQuerySchema>;
export const bookPageSchema = pageSchema(bookSchema);

// ---- copies ----

export const copySchema = z.object({
  id: z.uuid(),
  bookId: z.uuid(),
  barcode: z.string(),
  status: z.enum(COPY_STATUSES),
  version: z.number().int().min(1),
});
export type CopyDto = z.output<typeof copySchema>;

export const addCopiesSchema = z.object({ count: z.number().int().min(1).max(50) }).strict();
export type AddCopies = z.output<typeof addCopiesSchema>;

/** The states staff may set by hand. `on_loan` is only ever set by lending a copy. */
export const setCopyStatusSchema = z
  .object({
    version: versionField,
    status: z.enum(['available', 'lost', 'withdrawn']),
  })
  .strict();
export type SetCopyStatus = z.output<typeof setCopyStatusSchema>;
