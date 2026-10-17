import { Controller, Get } from '@nestjs/common';
import { OpenApiRegistry, paginationQuerySchema, type RouteDef } from '@library/kit';
import { z } from 'zod';
import {
  changePasswordSchema,
  createStaffSchema,
  listStaffQuerySchema,
  loginSchema,
  refreshSchema,
  staffPageSchema,
  tokenPairSchema,
  updateStaffSchema,
  userSchema,
} from './auth/auth.contract.js';
import {
  addCopiesSchema,
  bookPageSchema,
  bookSchema,
  copySchema,
  createBookSchema,
  createGenreSchema,
  genrePageSchema,
  genreSchema,
  listBooksQuerySchema,
  setCopyStatusSchema,
  updateBookSchema,
  updateGenreSchema,
} from './catalog/catalog.contract.js';
import {
  createLoanSchema,
  finePageSchema,
  fineSchema,
  idempotencyHeaderSchema,
  listFinesQuerySchema,
  listLoansQuerySchema,
  loanPageSchema,
  loanSchema,
  popularGenreSchema,
  popularGenresQuerySchema,
  returnResultSchema,
  summarySchema,
  waiveFineSchema,
} from './circulation/circulation.contract.js';
import { Public } from './common/auth.js';
import {
  createMemberSchema,
  listMembersQuerySchema,
  memberDetailSchema,
  memberPageSchema,
  memberSchema,
  updateMemberSchema,
} from './members/members.contract.js';

type Access = 'public' | 'staff' | 'admin';

const ACCESS_NOTE: Record<Access, string> = {
  public: 'No sign-in needed.',
  staff: 'Requires a signed-in librarian or admin.',
  admin: 'Requires the admin role.',
};

const idParams = z.object({ id: z.uuid() });
const accessByOperation = new Map<string, Access>();
const def = (access: Access, d: RouteDef): RouteDef => {
  accessByOperation.set(d.operationId, access);
  return { ...d, summary: `${d.summary}. ${ACCESS_NOTE[access]}` };
};
const noContent = { 204: { description: 'Done' } };

let cached: Record<string, unknown> | undefined;

/** The OpenAPI document, built from the same schemas the controllers validate with. */
export function openApiDocument(): Record<string, unknown> {
  if (cached) return cached;
  const registry = new OpenApiRegistry({
    title: 'Library API',
    version: '0.1.0',
    description:
      'Library management: public catalogue, members, circulation and fines. Money is integer minor units.',
  });
  const A = '/api/v1';
  const tag = (t: string) => ({ tags: [t] });
  const query = (s: unknown) => s as z.ZodObject;

  [
    def('public', {
      method: 'post',
      path: `${A}/auth/login`,
      operationId: 'login',
      summary: 'Exchange credentials for tokens',
      ...tag('auth'),
      request: { body: loginSchema },
      responses: { 200: { description: 'Tokens', schema: tokenPairSchema } },
    }),
    def('public', {
      method: 'post',
      path: `${A}/auth/refresh`,
      operationId: 'refresh',
      summary: 'Rotate a refresh token (a reused token revokes the whole session)',
      ...tag('auth'),
      request: { body: refreshSchema },
      responses: { 200: { description: 'New tokens', schema: tokenPairSchema } },
    }),
    def('public', {
      method: 'post',
      path: `${A}/auth/logout`,
      operationId: 'logout',
      summary: 'Revoke the session of a refresh token',
      ...tag('auth'),
      request: { body: refreshSchema },
      responses: noContent,
    }),
    def('staff', {
      method: 'get',
      path: `${A}/me`,
      operationId: 'getMe',
      summary: 'The signed-in staff member',
      ...tag('auth'),
      responses: { 200: { description: 'The user', schema: userSchema } },
    }),
    def('staff', {
      method: 'post',
      path: `${A}/me/password`,
      operationId: 'changePassword',
      summary: 'Change your password; every session is signed out',
      ...tag('auth'),
      request: { body: changePasswordSchema },
      responses: noContent,
    }),
    def('admin', {
      method: 'post',
      path: `${A}/staff`,
      operationId: 'createStaff',
      summary: 'Create a staff account',
      ...tag('staff'),
      request: { body: createStaffSchema },
      responses: { 201: { description: 'Created', schema: userSchema } },
    }),
    def('admin', {
      method: 'get',
      path: `${A}/staff`,
      operationId: 'listStaff',
      summary: 'List staff accounts',
      ...tag('staff'),
      request: { query: listStaffQuerySchema },
      responses: { 200: { description: 'A page', schema: staffPageSchema } },
    }),
    def('admin', {
      method: 'patch',
      path: `${A}/staff/{id}`,
      operationId: 'updateStaff',
      summary: 'Update, re-role, disable or reset a staff account (never your own role or status)',
      ...tag('staff'),
      request: { params: idParams, body: updateStaffSchema },
      responses: { 200: { description: 'The user', schema: userSchema } },
    }),

    def('public', {
      method: 'get',
      path: `${A}/genres`,
      operationId: 'listGenres',
      summary: 'List genres',
      ...tag('catalogue'),
      request: { query: paginationQuerySchema },
      responses: { 200: { description: 'A page', schema: genrePageSchema } },
    }),
    def('staff', {
      method: 'post',
      path: `${A}/genres`,
      operationId: 'createGenre',
      summary: 'Create a genre',
      ...tag('catalogue'),
      request: { body: createGenreSchema },
      responses: { 201: { description: 'Created', schema: genreSchema } },
    }),
    def('staff', {
      method: 'patch',
      path: `${A}/genres/{id}`,
      operationId: 'updateGenre',
      summary: 'Rename a genre',
      ...tag('catalogue'),
      request: { params: idParams, body: updateGenreSchema },
      responses: { 200: { description: 'The genre', schema: genreSchema } },
    }),
    def('staff', {
      method: 'delete',
      path: `${A}/genres/{id}`,
      operationId: 'deleteGenre',
      summary: 'Soft-delete an unused genre',
      ...tag('catalogue'),
      request: { params: idParams },
      responses: noContent,
    }),
    def('public', {
      method: 'get',
      path: `${A}/books`,
      operationId: 'listBooks',
      summary: 'Search the catalogue by title, author or ISBN',
      ...tag('catalogue'),
      request: { query: query(listBooksQuerySchema) },
      responses: { 200: { description: 'A page', schema: bookPageSchema } },
    }),
    def('public', {
      method: 'get',
      path: `${A}/books/{id}`,
      operationId: 'getBook',
      summary: 'A book with its copy counts',
      ...tag('catalogue'),
      request: { params: idParams },
      responses: { 200: { description: 'The book', schema: bookSchema } },
    }),
    def('staff', {
      method: 'post',
      path: `${A}/books`,
      operationId: 'createBook',
      summary: 'Catalogue a book and register its copies',
      ...tag('catalogue'),
      request: { body: createBookSchema },
      responses: { 201: { description: 'Created', schema: bookSchema } },
    }),
    def('staff', {
      method: 'patch',
      path: `${A}/books/{id}`,
      operationId: 'updateBook',
      summary: 'Update a book (optimistic concurrency via version)',
      ...tag('catalogue'),
      request: { params: idParams, body: updateBookSchema },
      responses: { 200: { description: 'The book', schema: bookSchema } },
    }),
    def('staff', {
      method: 'delete',
      path: `${A}/books/{id}`,
      operationId: 'deleteBook',
      summary: 'Soft-delete a book with no copies on loan',
      ...tag('catalogue'),
      request: { params: idParams },
      responses: noContent,
    }),
    def('staff', {
      method: 'get',
      path: `${A}/books/{id}/copies`,
      operationId: 'listCopies',
      summary: 'The physical copies of a book',
      ...tag('catalogue'),
      request: { params: idParams },
      responses: { 200: { description: 'Copies', schema: z.array(copySchema) } },
    }),
    def('staff', {
      method: 'post',
      path: `${A}/books/{id}/copies`,
      operationId: 'addCopies',
      summary: 'Register more copies of a book',
      ...tag('catalogue'),
      request: { params: idParams, body: addCopiesSchema },
      responses: { 201: { description: 'Created', schema: z.array(copySchema) } },
    }),
    def('staff', {
      method: 'patch',
      path: `${A}/copies/{id}`,
      operationId: 'setCopyStatus',
      summary: 'Mark a copy lost, withdrawn or available (never while on loan)',
      ...tag('catalogue'),
      request: { params: idParams, body: setCopyStatusSchema },
      responses: { 200: { description: 'The copy', schema: copySchema } },
    }),

    def('staff', {
      method: 'post',
      path: `${A}/members`,
      operationId: 'createMember',
      summary: 'Register a member and issue a card number',
      ...tag('members'),
      request: { body: createMemberSchema },
      responses: { 201: { description: 'Created', schema: memberSchema } },
    }),
    def('staff', {
      method: 'get',
      path: `${A}/members`,
      operationId: 'listMembers',
      summary: 'List members',
      ...tag('members'),
      request: { query: query(listMembersQuerySchema) },
      responses: { 200: { description: 'A page', schema: memberPageSchema } },
    }),
    def('staff', {
      method: 'get',
      path: `${A}/members/{id}`,
      operationId: 'getMember',
      summary: 'A member with their open loans and fines owed',
      ...tag('members'),
      request: { params: idParams },
      responses: { 200: { description: 'The member', schema: memberDetailSchema } },
    }),
    def('staff', {
      method: 'patch',
      path: `${A}/members/{id}`,
      operationId: 'updateMember',
      summary: 'Update or suspend a member',
      ...tag('members'),
      request: { params: idParams, body: updateMemberSchema },
      responses: { 200: { description: 'The member', schema: memberSchema } },
    }),
    def('staff', {
      method: 'delete',
      path: `${A}/members/{id}`,
      operationId: 'deleteMember',
      summary: 'Soft-delete a member with no loans or fines',
      ...tag('members'),
      request: { params: idParams },
      responses: noContent,
    }),

    def('staff', {
      method: 'post',
      path: `${A}/loans`,
      operationId: 'borrow',
      summary: 'Lend a book (by book id or copy barcode)',
      ...tag('circulation'),
      request: { headers: idempotencyHeaderSchema, body: createLoanSchema },
      responses: { 201: { description: 'The loan', schema: loanSchema } },
    }),
    def('staff', {
      method: 'get',
      path: `${A}/loans`,
      operationId: 'listLoans',
      summary: 'List loans (open, returned, overdue)',
      ...tag('circulation'),
      request: { query: query(listLoansQuerySchema) },
      responses: { 200: { description: 'A page', schema: loanPageSchema } },
    }),
    def('staff', {
      method: 'get',
      path: `${A}/loans/{id}`,
      operationId: 'getLoan',
      summary: 'A loan',
      ...tag('circulation'),
      request: { params: idParams },
      responses: { 200: { description: 'The loan', schema: loanSchema } },
    }),
    def('staff', {
      method: 'post',
      path: `${A}/loans/{id}/return`,
      operationId: 'returnLoan',
      summary: 'Take a book back; an overdue return charges a fine',
      ...tag('circulation'),
      request: { params: idParams },
      responses: { 200: { description: 'The loan and any fine', schema: returnResultSchema } },
    }),
    def('staff', {
      method: 'post',
      path: `${A}/loans/{id}/renew`,
      operationId: 'renewLoan',
      summary: 'Extend a loan that is not overdue (limited number of renewals)',
      ...tag('circulation'),
      request: { params: idParams },
      responses: { 200: { description: 'The loan', schema: loanSchema } },
    }),
    def('staff', {
      method: 'get',
      path: `${A}/fines`,
      operationId: 'listFines',
      summary: 'List fines',
      ...tag('circulation'),
      request: { query: query(listFinesQuerySchema) },
      responses: { 200: { description: 'A page', schema: finePageSchema } },
    }),
    def('staff', {
      method: 'post',
      path: `${A}/fines/{id}/pay`,
      operationId: 'payFine',
      summary: 'Record that a fine was paid',
      ...tag('circulation'),
      request: { params: idParams },
      responses: { 200: { description: 'The fine', schema: fineSchema } },
    }),
    def('admin', {
      method: 'post',
      path: `${A}/fines/{id}/waive`,
      operationId: 'waiveFine',
      summary: 'Waive a fine, recording the reason',
      ...tag('circulation'),
      request: { params: idParams, body: waiveFineSchema },
      responses: { 200: { description: 'The fine', schema: fineSchema } },
    }),
    def('staff', {
      method: 'get',
      path: `${A}/reports/overdue`,
      operationId: 'overdueReport',
      summary: 'Open loans past their due date, oldest first',
      ...tag('reports'),
      responses: { 200: { description: 'Overdue loans', schema: z.array(loanSchema) } },
    }),
    def('staff', {
      method: 'get',
      path: `${A}/reports/popular-genres`,
      operationId: 'popularGenres',
      summary: 'Genres ranked by loans in the last N days',
      ...tag('reports'),
      request: { query: popularGenresQuerySchema },
      responses: { 200: { description: 'Ranking', schema: z.array(popularGenreSchema) } },
    }),
    def('staff', {
      method: 'get',
      path: `${A}/reports/summary`,
      operationId: 'summaryReport',
      summary: 'Dashboard totals',
      ...tag('reports'),
      responses: { 200: { description: 'Totals', schema: summarySchema } },
    }),
  ].forEach((r) => registry.add(r));

  const doc = registry.document() as {
    paths: Record<string, Record<string, Record<string, unknown>>>;
  };
  for (const methods of Object.values(doc.paths)) {
    for (const op of Object.values(methods)) {
      const access = accessByOperation.get(op['operationId'] as string);
      if (access && access !== 'public') op['security'] = [{ bearerAuth: [] }];
    }
  }
  cached = {
    ...doc,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
  };
  return cached;
}

@Controller()
export class OpenApiController {
  @Public()
  @Get('openapi.json')
  document() {
    return openApiDocument();
  }
}
