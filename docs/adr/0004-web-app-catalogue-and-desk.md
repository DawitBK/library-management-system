# ADR 0004: a public catalogue and a staff desk in one Next.js app

Status: accepted

## Decision

- **Two audiences, one app.** The public catalogue (`/`, `/books/[id]`) needs no account and is built
  to be found: server-rendered pages, `Book` JSON-LD, canonical URLs, an XML sitemap from the live
  catalogue, `noindex` on filtered and paged result pages, and `robots.txt` that keeps the desk out.
  The staff desk (`/desk/*`) is behind sign-in; members do not have accounts (ADR 0001), so there is
  no member login to build.
- **Tokens never reach page JavaScript.** Both live in `httpOnly` cookies set by the web server;
  server components call the API with them and browser code calls one route handler, `/bff`, which
  adds the token. `proxy.ts` renews the access token before a page renders, and concurrent requests
  that carry the same refresh token share one refresh, because the API treats a reused rotated token
  as theft. Guests may read books and genres through `/bff`; everything else needs the cookie.
- **The lending desk is built for a scanner.** Scan a card (an exact card number selects the member
  at once), scan a book to lend it, scan any barcode to return it without choosing a member (the API
  finds the open loan by barcode), and see at once if a returned copy was set aside for a waiting
  member. Every lend carries one idempotency key per scan.
- **Roles hide, the API refuses.** Staff administration and waiving fines are administrator-only in
  the API; the desk only hides what would be refused.
- **Cached public reads refresh on change.** Catalogue reads are cached briefly and tagged; any
  successful write through the app to books, copies, loans, holds or members expires the tag, so the
  public page shows "all copies out" the moment the last copy is lent.

## Consequences

- Refresh de-duplication is per web-server process; several instances need sticky sessions.
- A change made directly against the API shows in cached public pages within the cache time.
