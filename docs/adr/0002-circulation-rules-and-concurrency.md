# ADR-0002: Circulation rules and concurrency

**Status:** accepted

Books are catalogue records; circulation works on physical **copies** (each with a barcode and a
status: available, on loan, lost, withdrawn). A book's availability is counted from its copies.

Two desks must never lend the same copy, and one member must never exceed the loan limit however
many desks serve them at once. Three layers enforce it:

1. The member row is locked first in the lending transaction, so a member's requests are serialised.
2. A copy is chosen with `FOR UPDATE SKIP LOCKED`, so concurrent desks lending the last copy never
   wait on each other and never both get it (one succeeds, the rest answer 409).
3. A partial unique index (`loans_one_open_per_copy`) makes a second open loan on a copy
   impossible whatever the application does.

Fines are computed once, at return, from whole overdue days rounded up (one hour late is one day
late), stored in minor units, and are unique per loan. A member who owes the blocking amount cannot
borrow until the fine is paid or waived. Waiving is an administrator's decision and requires a
written reason, kept with the fine and in the audit log. All numbers (14-day loan, 2 renewals, 5
open loans, 2.00 ETB a day, 50.00 ETB blocking threshold) live in `policy.ts`.

Not built yet: reservations (holds) when no copy is free, email reminders (the outbox already
records `loan.created` and `loan.returned`), per-member loan limits by membership type.
