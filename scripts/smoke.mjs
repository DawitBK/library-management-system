/**
 * End-to-end smoke test of the whole stack as people use it: a real PostgreSQL database, the built
 * API, the built web app, and HTTP between them. An administrator sets the library up, the public
 * browses the catalogue (and search engines are told the right things), the desk lends, queues a
 * hold, returns, hands the held copy to the right member and charges a fine, and every door a
 * librarian must not walk through is tried.
 *
 *   DATABASE_URL=postgres://user:pass@host:5432/library_smoke node scripts/smoke.mjs
 *
 * Needs a build first. The database name must end in `_smoke`; it is dropped and recreated.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pg = createRequire(path.join(root, 'apps/api/package.json'))('pg');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const dbName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!dbName.endsWith('_smoke'))
  throw new Error(`Refusing to recreate "${dbName}": it must end in _smoke`);

const API_PORT = 3100;
const WEB_PORT = 3101;
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const ADMIN = { email: 'admin@smoke.test', password: 'a long smoke passphrase' };
const LIBRARIAN = { email: 'librarian@smoke.test', password: 'another long smoke passphrase' };

const children = [];
let failures = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  process.stdout.write(
    `${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !detail ? '' : `  -> ${detail}`}\n`,
  );
}

function run(file, args, env) {
  const r = spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`${file} failed:\n${r.stdout}\n${r.stderr}`);
}

function start(name, file, args, env, cwd = root) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.on('exit', (code) => {
    if (code && code !== 0 && code !== null)
      process.stdout.write(`${name} exited ${code}\n${log.slice(-2000)}\n`);
  });
  children.push(child);
  return () => log;
}

async function waitFor(url, label, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not come up at ${url}`);
}

async function recreateDatabase() {
  const admin = new URL(databaseUrl);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [dbName],
    );
    await client.query(`drop database if exists "${dbName}"`);
    await client.query(`create database "${dbName}"`);
  } finally {
    await client.end();
  }
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const { rows } = await db.query("select current_setting('server_version_num')::int as v");
    if (rows[0].v < 180000) {
      // PostgreSQL 18 has uuidv7(); an older local server gets an equivalent for the smoke run.
      await db.query(`create or replace function uuidv7() returns uuid language sql volatile as $$
        select encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid()) placing
          substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3) from 1 for 6), 52, 1), 53, 1), 'hex')::uuid $$`);
    }
  } finally {
    await db.end();
  }
}

async function pgExec(sql) {
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query(sql);
  } finally {
    await db.end();
  }
}

async function api(method, p, { token, body, headers } = {}) {
  const res = await fetch(`${API}/api/v1${p}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

/** A person's browser: a cookie jar that follows what the web server sets. */
function browser(initial) {
  const jar = new Map(Object.entries(initial));
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (res) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  return {
    jar,
    async get(p) {
      const res = await fetch(`${WEB}${p}`, {
        redirect: 'manual',
        headers: { cookie: cookieHeader() },
      });
      absorb(res);
      return {
        status: res.status,
        location: res.headers.get('location'),
        text: await res.text(),
        res,
      };
    },
    async bff(method, p, body, headers = {}) {
      const res = await fetch(`${WEB}/bff${p}`, {
        method,
        headers: {
          cookie: cookieHeader(),
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      absorb(res);
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : undefined };
    },
  };
}

const sessionFor = async (creds) => {
  const r = await api('POST', '/auth/login', { body: creds });
  if (r.status !== 200) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
};

async function main() {
  process.stdout.write(`Smoke test against ${dbName}\n`);
  await recreateDatabase();
  const apiEnv = {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    PORT: String(API_PORT),
    NODE_ENV: 'production',
    LOG_LEVEL: 'warn',
  };
  run('apps/api/dist/db/migrate.js', [], apiEnv);
  run('apps/api/dist/bootstrap-admin.js', [], {
    ...apiEnv,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
  });
  start('api', 'apps/api/dist/main.js', [], apiEnv);
  await waitFor(`${API}/health/ready`, 'API');
  const nextBin = path.join(root, 'apps/web/node_modules/next/dist/bin/next');
  start(
    'web',
    nextBin,
    ['start', '--port', String(WEB_PORT), '--hostname', '127.0.0.1'],
    { API_URL: API, NODE_ENV: 'production', SITE_URL: WEB },
    path.join(root, 'apps/web'),
  );
  await waitFor(`${WEB}/login`, 'web app');

  // --- the public catalogue and the locked desk
  const guest = browser({});
  const home = await guest.get('/');
  check(
    'the public catalogue renders',
    home.status === 200 && home.text.includes('Library catalogue'),
  );
  const desk0 = await guest.get('/desk');
  check(
    'the desk redirects to sign-in and remembers the way back',
    desk0.status === 307 && desk0.location?.includes('/login?next=%2Fdesk'),
    `${desk0.status} ${desk0.location}`,
  );
  const guestRead = await guest.bff('GET', '/books');
  check('a guest may read books through the API door', guestRead.status === 200);
  const guestMembers = await guest.bff('GET', '/members');
  check('a guest may not read members through the API door', guestMembers.status === 401);

  // --- the administrator sets up the library; only the refresh cookie survives
  const adminSession = await sessionFor(ADMIN);
  const a = browser({ lc_refresh: adminSession.refreshToken });
  const deskHome = await a.get('/desk');
  check(
    'an expired access token is renewed by the proxy',
    deskHome.status === 200 && a.jar.has('lc_access') && deskHome.text.includes('Overview'),
    `${deskHome.status}`,
  );
  const genre = await a.bff('POST', '/genres', { name: 'Fiction' });
  check('create a genre', genre.status === 201, JSON.stringify(genre.json));
  const book = await a.bff('POST', '/books', {
    title: 'The <i>Smoke</i> Test',
    authors: ['Ada Author', 'Bo Writer'],
    isbn: '9780306406157',
    publishedYear: 2020,
    genreId: genre.json?.id,
    description: 'A book written for the smoke test.',
    copies: 1,
  });
  check('add a book with one copy', book.status === 201, JSON.stringify(book.json));
  const copies = await a.bff('GET', `/books/${book.json?.id}/copies`);
  const barcode = copies.json?.[0]?.barcode;
  check('the copy has a barcode', typeof barcode === 'string', JSON.stringify(copies.json));
  const alice = await a.bff('POST', '/members', {
    name: 'Alice Reader',
    email: 'alice@smoke.test',
  });
  const bob = await a.bff('POST', '/members', { name: 'Bob Reader', email: 'bob@smoke.test' });
  check('register two members', alice.status === 201 && bob.status === 201);
  for (const p of [
    '/desk/circulation',
    '/desk/loans',
    '/desk/holds',
    '/desk/fines',
    '/desk/members',
    '/desk/books',
    '/desk/genres',
    '/desk/staff',
    `/desk/books/${book.json?.id}`,
    `/desk/members/${alice.json?.id}`,
  ]) {
    const r = await a.get(p);
    check(`desk page ${p} renders`, r.status === 200, `${r.status}`);
  }

  // --- the public catalogue shows it, and search engines are told the right things
  const list = await guest.get('/');
  check('the book appears in the public catalogue', list.text.includes('Smoke'));
  const page = await guest.get(`/books/${book.json?.id}`);
  check(
    'the book page shows availability',
    page.status === 200 && page.text.includes('on the shelf'),
  );
  check(
    'the book page carries Book structured data',
    page.text.includes('"@type":"Book"') && page.text.includes('9780306406157'),
  );
  check('book text is escaped, never injected as markup', !page.text.includes('<i>Smoke</i>'));
  const search = await guest.get('/?q=Smoke');
  check('search finds the book', search.text.includes('Smoke'));
  const missing = await guest.get('/books/00000000-0000-4000-8000-000000000000');
  check('an unknown book is a 404', missing.status === 404, `${missing.status}`);
  const sitemap = await guest.get('/sitemap.xml');
  check('the sitemap lists the book', sitemap.text.includes(`/books/${book.json?.id}`));
  const robots = await guest.get('/robots.txt');
  check('robots.txt keeps the desk out of search', robots.text.includes('Disallow: /desk'));

  // --- one desk day: lend, queue, return, pick up
  const lent = await a.bff(
    'POST',
    '/loans',
    { memberId: alice.json?.id, barcode },
    { 'idempotency-key': 'smoke-loan-1' },
  );
  const again = await a.bff(
    'POST',
    '/loans',
    { memberId: alice.json?.id, barcode },
    { 'idempotency-key': 'smoke-loan-1' },
  );
  check(
    'lend the copy by its scanned barcode',
    lent.status === 201 && lent.json?.barcode === barcode,
    JSON.stringify(lent.json),
  );
  check('the same idempotency key replays the same loan', again.json?.id === lent.json?.id);
  const onLoan = await guest.get(`/books/${book.json?.id}`);
  check('the public page now says all copies are out', onLoan.text.includes('out'));
  const byBarcode = await a.bff('GET', `/loans?barcode=${barcode}&status=open`);
  check(
    'the desk finds the open loan by barcode',
    byBarcode.json?.items?.[0]?.id === lent.json?.id,
  );

  const hold = await a.bff('POST', '/holds', { memberId: bob.json?.id, bookId: book.json?.id });
  check(
    'a second member joins the queue',
    hold.status === 201 && hold.json?.queuePosition === 1,
    JSON.stringify(hold.json),
  );
  const early = await a.bff('POST', '/loans', { memberId: bob.json?.id, barcode });
  check('a copy that is out cannot be lent again', early.status === 409, `${early.status}`);

  const back = await a.bff('POST', `/loans/${lent.json?.id}/return`, {});
  check(
    'the first member returns the book',
    back.status === 200 && back.json?.loan?.returnedAt,
    JSON.stringify(back.json),
  );
  const ready = await a.bff('GET', `/holds/${hold.json?.id}`);
  check(
    'the returned copy is set aside for the second member',
    ready.json?.status === 'ready' && ready.json?.barcode === barcode,
  );
  const stranger = await a.bff('POST', '/members', { name: 'Cy Stranger', email: 'cy@smoke.test' });
  const stolen = await a.bff('POST', '/loans', { memberId: stranger.json?.id, barcode });
  check(
    'another member cannot take the held copy',
    stolen.status === 409 && stolen.json?.code === 'copy-held',
    JSON.stringify(stolen.json),
  );
  const holdsPage = await a.get('/desk/holds');
  check('the holds page shows the ready hold', holdsPage.text.includes('Bob Reader'));
  const pickup = await a.bff('POST', '/loans', { memberId: bob.json?.id, bookId: book.json?.id });
  check(
    'the holder takes it',
    pickup.status === 201 && pickup.json?.barcode === barcode,
    JSON.stringify(pickup.json),
  );
  const closed = await a.bff('GET', `/holds/${hold.json?.id}`);
  check('the hold is fulfilled', closed.json?.status === 'fulfilled');

  // --- a fine: the book comes back late
  await pgExec(
    `update loans set borrowed_at = now() - interval '20 days', due_at = now() - interval '3 days' + interval '1 hour' where id = '${pickup.json?.id}'`,
  );
  const late = await a.bff('POST', `/loans/${pickup.json?.id}/return`, {});
  check(
    'a late return charges a fine',
    late.json?.fine?.amountMinor === 3 * 200,
    JSON.stringify(late.json),
  );
  const finesPage = await a.get('/desk/fines');
  check(
    'the fines page lists it',
    finesPage.text.includes('Bob Reader') || finesPage.text.includes('6.00'),
  );
  const paid = await a.bff('POST', `/fines/${late.json?.fine?.id}/pay`, {});
  check(
    'the fine is paid',
    paid.status === 200 && paid.json?.status === 'paid',
    JSON.stringify(paid.json),
  );

  // --- a librarian is not an administrator
  await a.bff('POST', '/staff', {
    ...LIBRARIAN,
    firstName: 'Lee',
    lastName: 'Brarian',
    role: 'librarian',
  });
  const libSession = await sessionFor(LIBRARIAN);
  const l = browser({ lc_refresh: libSession.refreshToken });
  const lDesk = await l.get('/desk');
  check('a librarian reaches the desk', lDesk.status === 200);
  const lStaff = await l.get('/desk/staff');
  check(
    'a librarian is sent away from staff administration',
    lStaff.status === 307,
    `${lStaff.status}`,
  );
  const lCreate = await l.bff('POST', '/staff', {
    ...LIBRARIAN,
    email: 'x@smoke.test',
    firstName: 'X',
    lastName: 'Y',
    role: 'admin',
  });
  check('the API refuses a librarian creating staff', lCreate.status === 403, `${lCreate.status}`);
  const lWaive = await l.bff('POST', `/fines/${late.json?.fine?.id}/waive`, { reason: 'because' });
  check('the API refuses a librarian waiving a fine', lWaive.status === 403, `${lWaive.status}`);
}

try {
  await main();
} catch (e) {
  failures += 1;
  process.stdout.write(`\nSmoke test crashed: ${e.stack ?? e}\n`);
} finally {
  for (const c of children) c.kill();
  process.stdout.write(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed\n`);
  process.exit(failures ? 1 : 0);
}
