/** Response shapes the web app reads. The API's OpenAPI document is the source of truth. */
export type Role = 'librarian' | 'admin';

export interface Page<T> {
  items: T[];
  page: { limit: number; offset: number; total: number };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  active: boolean;
  version: number;
  createdAt: string;
}

export interface Genre {
  id: string;
  name: string;
  version: number;
}

export interface Book {
  id: string;
  isbn: string | null;
  title: string;
  authors: string[];
  publishedYear: number | null;
  genreId: string;
  genreName: string;
  description: string | null;
  totalCopies: number;
  availableCopies: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type CopyStatus = 'available' | 'held' | 'on_loan' | 'lost' | 'withdrawn';
export interface Copy {
  id: string;
  bookId: string;
  barcode: string;
  status: CopyStatus;
  version: number;
}

export interface Member {
  id: string;
  cardNumber: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'suspended';
  version: number;
  createdAt: string;
}
export interface MemberDetail extends Member {
  openLoans: number;
  unpaidFinesMinor: number;
}

export interface Loan {
  id: string;
  memberId: string;
  memberName: string;
  copyId: string;
  barcode: string;
  bookId: string;
  bookTitle: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  renewals: number;
  overdue: boolean;
  daysOverdue: number;
}

export interface Fine {
  id: string;
  loanId: string;
  memberId: string;
  amountMinor: number;
  status: 'unpaid' | 'paid' | 'waived';
  waiveReason: string | null;
  createdAt: string;
}

export type HoldStatus = 'waiting' | 'ready' | 'fulfilled' | 'cancelled' | 'expired';
export interface Hold {
  id: string;
  bookId: string;
  bookTitle: string;
  memberId: string;
  memberName: string;
  status: HoldStatus;
  placedAt: string;
  queuePosition: number | null;
  barcode: string | null;
  readyAt: string | null;
  expiresAt: string | null;
  closedAt: string | null;
  fulfilledLoanId: string | null;
}

export interface Summary {
  titles: number;
  copies: number;
  availableCopies: number;
  members: number;
  openLoans: number;
  overdueLoans: number;
  unpaidFinesMinor: number;
}
