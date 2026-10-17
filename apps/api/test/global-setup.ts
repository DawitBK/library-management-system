import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';

/**
 * PostgreSQL 18 (what CI and production run) has `uuidv7()` built in. On an older local server the
 * same function is defined here so the suite can run, with the same behaviour for the tests' purposes.
 */
const UUIDV7_SHIM = `
create or replace function uuidv7() returns uuid language sql volatile as $$
  select encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid()) placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3) from 1 for 6),
        52, 1),
      53, 1),
    'hex')::uuid
$$`;

export default async function setup(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL is required for integration tests. Start PostgreSQL with `pnpm db:up` and set ' +
        'DATABASE_URL=postgres://library:library@localhost:5432/library',
    );
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ v: number }>(
      `select current_setting('server_version_num')::int as v`,
    );
    if ((rows[0]?.v ?? 0) < 180000) await client.query(UUIDV7_SHIM);
  } finally {
    await client.end();
  }
  await runMigrations(url);
}
