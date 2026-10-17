# Library: recovery spec of the legacy application

The original (`legacy-v1`) is a React 19 + Vite single-page app with no backend of its own: every
call goes to a third-party hosted API at `back-end-for-assessment.vercel.app`, which this
repository neither contains nor controls. The rebuild therefore ships the API the app always
needed.

## What the front end used (and where the rebuild puts it)

| Legacy call                                                                  | Rebuild                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /auth/login` (token stored in `localStorage`)                          | `POST /api/v1/auth/login`, rotating refresh tokens               |
| `GET /auth/users`, `POST /staff`, `PATCH /staff/:id`                         | `GET/POST/PATCH /api/v1/staff` (admin only)                      |
| `GET/POST/PATCH/DELETE /members`                                             | `/api/v1/members` (staff)                                        |
| `GET /books`, `POST /books`, `PATCH /books/:id`, `DELETE /books/:id`         | `/api/v1/books`; public reads                                    |
| `GET/POST/PATCH/DELETE /genres`                                              | `/api/v1/genres`; public reads                                   |
| `GET /borrow-records`, `POST /borrow-records`, `POST /borrow-records/return` | `/api/v1/loans`, `/api/v1/loans/:id/return`, `/renew`            |
| `GET /borrow-records/reports/overdue`, `/reports/popular-genres`             | `/api/v1/reports/overdue`, `/reports/popular-genres`, `/summary` |

The legacy book had `title`, `author`, `published_year`, `genre_id` and `available_copies`.
Here `available_copies` is derived from real copies (each with a barcode), and a book may have
several authors and a validated ISBN.

## Pages to reproduce in the new staff app

Dashboard, Books, Borrow/Return, Genres, Members, Staff, Reports, Login, Not authorised: nine
screens, one for one.

## Weaknesses of the legacy app the rebuild removes

1. A hosted API it did not own: no schema, no tests, no control of its security.
2. The access token in `localStorage` (readable by any script on the page) and role checks done
   only in the browser.
3. The dashboard counted books, members and loans by downloading every record and filtering in
   the browser; the rebuild serves totals from one query.
4. No concept of physical copies: `available_copies` was a number someone had to keep right by hand.
5. No fines, no renewals, no loan limit, no audit trail.
