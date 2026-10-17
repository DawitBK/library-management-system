import { describe, expect, it } from 'vitest';
import { createBookSchema } from './catalog/catalog.contract.js';
import { normalizeIsbn } from './catalog/isbn.js';
import { createLoanSchema } from './circulation/circulation.contract.js';
import { addDays, daysOverdue } from './circulation/policy.js';
import { openApiDocument } from './openapi.js';

describe('ISBN', () => {
  it('accepts valid ISBN-10 and ISBN-13 in any common spelling', () => {
    expect(normalizeIsbn('0-306-40615-2')).toBe('0306406152');
    expect(normalizeIsbn('978 0 385 47454 2')).toBe('9780385474542');
    expect(normalizeIsbn('080442957X')).toBe('080442957X');
    expect(normalizeIsbn('080442957x')).toBe('080442957X');
  });

  it('rejects a wrong check digit, wrong length and non-digits', () => {
    expect(normalizeIsbn('0-306-40615-3')).toBeUndefined();
    expect(normalizeIsbn('978-0-385-47454-3')).toBeUndefined();
    expect(normalizeIsbn('12345')).toBeUndefined();
    expect(normalizeIsbn('abcdefghij')).toBeUndefined();
  });
});

describe('overdue days', () => {
  const due = new Date('2026-01-10T12:00:00Z');
  it('counts nothing on or before the due time and rounds up after it', () => {
    expect(daysOverdue(due, due)).toBe(0);
    expect(daysOverdue(due, addDays(due, -3))).toBe(0);
    expect(daysOverdue(due, new Date(due.getTime() + 60 * 60 * 1000))).toBe(1);
    expect(daysOverdue(due, addDays(due, 1))).toBe(1);
    expect(daysOverdue(due, new Date(addDays(due, 1).getTime() + 1))).toBe(2);
  });
});

describe('contracts', () => {
  it('needs exactly one of bookId and barcode to lend', () => {
    const memberId = crypto.randomUUID();
    expect(createLoanSchema.safeParse({ memberId }).success).toBe(false);
    expect(createLoanSchema.safeParse({ memberId, bookId: crypto.randomUUID() }).success).toBe(
      true,
    );
    expect(createLoanSchema.safeParse({ memberId, barcode: 'LB-1' }).success).toBe(true);
    expect(
      createLoanSchema.safeParse({ memberId, barcode: 'LB-1', bookId: crypto.randomUUID() })
        .success,
    ).toBe(false);
  });

  it('requires an author and a valid ISBN when one is given', () => {
    const base = { title: 'T', genreId: crypto.randomUUID() };
    expect(createBookSchema.safeParse({ ...base, authors: [] }).success).toBe(false);
    expect(createBookSchema.safeParse({ ...base, authors: ['A'] }).success).toBe(true);
    expect(createBookSchema.safeParse({ ...base, authors: ['A'], isbn: '123' }).success).toBe(
      false,
    );
  });
});

describe('OpenAPI document', () => {
  const doc = openApiDocument() as {
    paths: Record<string, Record<string, { operationId: string; security?: unknown }>>;
  };
  const operations = Object.values(doc.paths).flatMap((m) => Object.values(m));

  it('has a unique operation id per route', () => {
    const ids = operations.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(35);
  });

  it('marks every non-public route as needing a bearer token', () => {
    const open = new Set(['login', 'refresh', 'logout', 'listGenres', 'listBooks', 'getBook']);
    for (const op of operations) {
      expect(op.security !== undefined, op.operationId).toBe(!open.has(op.operationId));
    }
  });
});
