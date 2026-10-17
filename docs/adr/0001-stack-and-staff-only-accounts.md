# ADR-0001: Stack, and staff-only accounts

**Status:** accepted

Node 24, NestJS 12 (modular monolith), Drizzle ORM, PostgreSQL 18, Zod for every contract,
Vitest: the same stack as the other services in this programme, so the shared `kit` and its
patterns carry over.

Only library staff sign in. Members are records, not accounts: they borrow at the desk and the
public catalogue needs no login. That removes self-registration, password recovery for patrons and
a whole class of abuse, and matches how a library actually works. Accounts are created by an
administrator, and the first administrator by a bootstrap command that refuses to run twice.

Authentication is argon2id, a 15-minute access token and rotating refresh tokens with reuse
detection (a spent token that comes back revokes the whole session). Disabling an account or
resetting a password ends its sessions at once; an access token already issued expires within 15
minutes. No account can demote or disable itself, so the last administrator can never be removed.

**Rejected:** member self-service accounts in the first release (extra attack surface for no
desk benefit); keeping the third-party hosted API (no ownership, no tests).
