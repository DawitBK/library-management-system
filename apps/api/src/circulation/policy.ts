/** Lending rules. One place, so the API, the tests and the documentation agree. */
export const POLICY = {
  loanDays: 14,
  renewalDays: 14,
  maxRenewals: 2,
  maxOpenLoans: 5,
  /** Fine per overdue day, in minor units (200 = 2.00 ETB). */
  finePerDayMinor: 200,
  /** A member who owes at least this much cannot borrow until they pay or are waived. */
  borrowBlockedAtFineMinor: 5000,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between the due date and the return, rounded up: one hour late is one day late. */
export function daysOverdue(dueAt: Date, at: Date): number {
  const late = at.getTime() - dueAt.getTime();
  return late <= 0 ? 0 : Math.ceil(late / DAY_MS);
}

export const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * DAY_MS);
