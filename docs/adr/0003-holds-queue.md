# ADR 0003: holds are a queue per book, served by returns

Status: accepted

## Context

When every copy of a book is out, a member wants a place in line, and the next copy that comes
back must go to the person who has waited longest, not to whoever is at the desk first. Members do
not sign in (ADR 0001), so staff keep the queue for them.

## Decision

- **A hold is a row, a copy set aside is a copy status.** `holds` has the states `waiting`, `ready`,
  `fulfilled`, `cancelled` and `expired`; a copy being kept for someone is `held`, which is neither
  available nor on loan. A hold may only be placed while no copy is on the shelf: a hold on a book
  that can be lent now would only delay the member.
- **One mechanism serves the queue.** `fillHolds` gives every available copy of a book to the
  longest-waiting active member. It runs after a return, a cancellation, an expiry, a copy put back
  on the shelf and a new copy added, so no path can leave a copy sitting available while someone
  waits. A suspended member keeps their place and is passed over until they are active again.
- **Pickup has a deadline.** A ready hold expires after three days (`POLICY.holdPickupDays`); the copy
  goes to the next member in the same transaction. There is no scheduler: the sweep runs on every
  borrow, hold placement and hold listing, and `POST /holds/process` runs it on demand, so a quiet
  library never holds a copy past its deadline for longer than until the next desk action.
- **Only the holder can take a held copy**, by barcode or by book; anyone else gets 409 `copy-held`.
- **The database refuses what the rules forbid:** one live hold per member and book, one ready hold
  per copy, and shape checks so a `ready` hold always names a copy and a deadline.
- **Lock order is member, then book, then that book's holds and copies**, everywhere. Placing a hold
  and returning the last copy both take the book's row first, so a hold placed while the copy is on
  its way back is either refused (the copy is on the shelf) or served by the return, never
  stranded. The concurrency tests exercise both outcomes.

## Consequences

- Queue position is derived (holds before this one on the same book), never stored, so cancelling
  needs no renumbering.
- Expiry is lazy. A deployment that wants prompt "your hold expired" notifications adds a scheduler
  that calls the same function; nothing else changes.
- Every transition writes an audit row and an outbox event (`hold.ready`, `hold.expired`,
  `hold.cancelled`), so the notification dispatcher, when it exists, needs no new hooks.
