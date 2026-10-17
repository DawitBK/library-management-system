# Library Management System

A library back office and public catalogue: books and their physical copies, members, lending,
renewals, fines and reports. Rebuilt on a modern stack as a reference implementation of an
enterprise-grade service.

> **Status:** the `next` branch holds the rebuild (API first; the staff app and public catalogue
> follow). `main` still holds the original React front end, tagged `legacy-v1`, which depended on
> someone else's hosted API. The front end lives in [`legacy/`](legacy/) on this branch until the
> rebuild reaches parity; what it used and what replaces it is in
> [docs/rebuild/legacy-spec.md](docs/rebuild/legacy-spec.md).

## Stack

Node 24, NestJS 12, Drizzle ORM, PostgreSQL 18, Zod contracts that also generate the OpenAPI
document, Vitest, pnpm 10 and Turborepo. Decisions are in [docs/adr](docs/adr).

## What the API does

| Area        | Behaviour                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff       | sign in, rotating refresh tokens with reuse detection, roles `librarian` and `admin`; only an admin creates, re-roles or disables accounts                       |
| Catalogue   | public search by title, author or ISBN (check digits verified); genres; books with physical copies and barcodes; soft delete                                     |
| Members     | records with a card number; suspend; deleted only when they hold nothing and owe nothing                                                                         |
| Circulation | lend by book or barcode, return, renew (limited); loan limit per member; the last copy goes to exactly one desk; idempotent                                      |
| Holds       | a queue per book when every copy is out; a returned copy is set aside for the longest-waiting member for three days, then passes on; only the holder can take it |
| Fines       | charged per overdue day on return, paid or waived (admin only, with a reason); high fines block borrowing                                                        |
| Reports     | overdue loans, popular genres, dashboard totals                                                                                                                  |
| Platform    | problem+json errors, request ids, health and readiness, `/openapi.json`, append-only audit log, transactional outbox                                             |

The lending rules (14-day loans, 2 renewals, 5 open loans, 2.00 ETB per overdue day) are in one
file: [policy.ts](apps/api/src/circulation/policy.ts). Money is integer minor units.

## Run it

```sh
corepack enable
pnpm install
pnpm db:up                       # PostgreSQL 18 in Docker
cp .env.example .env             # then export its values, or use your own loader
pnpm build
pnpm --filter @library/api db:migrate
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' pnpm --filter @library/api admin:bootstrap
pnpm --filter @library/api start
```

There is no public sign-up: the first administrator is created with `admin:bootstrap`, which
refuses to run once one exists. The contract is at `http://localhost:3000/openapi.json`.

## Test it

```sh
pnpm lint && pnpm typecheck && pnpm test
DATABASE_URL=postgres://library:library@localhost:5432/library pnpm test:integration
```

## Layout

```
apps/api/        the HTTP API (NestJS)
packages/kit/    shared building blocks: env, logging, problem+json, pagination, health, OpenAPI
packages/config/ shared TypeScript and ESLint presets
docs/            ADRs, the enterprise-bar scorecard, the legacy recovery spec
legacy/          the original front end (removed when the rebuild reaches parity)
```

Licensed under Apache-2.0.
