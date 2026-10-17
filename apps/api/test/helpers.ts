import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { parseEnv } from '@library/kit';
import pg from 'pg';
import request from 'supertest';
import { hashPassword } from '../src/auth/auth.service.js';
import { envSchema } from '../src/config.js';
import { createApp } from '../src/create-app.js';

export const PASSWORD = 'correct horse battery staple';

export interface TestContext {
  app: INestApplication;
  pool: pg.Pool;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export interface Session {
  id: string;
  email: string;
  token: string;
  refreshToken: string;
  auth: { Authorization: string };
}

export async function startContext(): Promise<TestContext> {
  const env = parseEnv(envSchema, {
    ...process.env,
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
  });
  const app = await createApp(env);
  const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'], max: 2 });
  return {
    app,
    pool,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

/** Staff accounts have no public sign-up, so tests insert them directly, then sign in through the API. */
export async function makeStaff(
  ctx: TestContext,
  role: 'librarian' | 'admin' = 'librarian',
): Promise<Session> {
  const email = `${randomUUID()}@example.test`;
  await ctx.pool.query(
    `insert into users (email, password_hash, first_name, last_name, role) values ($1, $2, 'Test', 'Staff', $3)`,
    [email, await hashPassword(PASSWORD), role],
  );
  return signIn(ctx, email);
}

export async function signIn(ctx: TestContext, email: string): Promise<Session> {
  const res = await ctx.http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    id: res.body.user.id,
    email,
    token: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

export async function makeGenre(ctx: TestContext, staff: Session): Promise<string> {
  const res = await ctx
    .http()
    .post('/api/v1/genres')
    .set(staff.auth)
    .send({ name: `Genre ${randomUUID().slice(0, 8)}` });
  if (res.status !== 201) throw new Error(`genre failed: ${res.status}`);
  return res.body.id;
}

export interface BookInfo {
  id: string;
  title: string;
  genreId: string;
  version: number;
}

export async function makeBook(
  ctx: TestContext,
  staff: Session,
  genreId: string,
  overrides: Record<string, unknown> = {},
): Promise<BookInfo> {
  const res = await ctx
    .http()
    .post('/api/v1/books')
    .set(staff.auth)
    .send({
      title: `Book ${randomUUID().slice(0, 8)}`,
      authors: ['Test Author'],
      genreId,
      copies: 1,
      ...overrides,
    });
  if (res.status !== 201) throw new Error(`book failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function makeMember(ctx: TestContext, staff: Session, status?: 'suspended') {
  const res = await ctx
    .http()
    .post('/api/v1/members')
    .set(staff.auth)
    .send({ name: 'Test Member', email: `${randomUUID()}@member.test` });
  if (res.status !== 201)
    throw new Error(`member failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (status) {
    await ctx
      .http()
      .patch(`/api/v1/members/${res.body.id}`)
      .set(staff.auth)
      .send({ version: res.body.version, status });
  }
  return res.body as { id: string; cardNumber: string; version: number };
}

/** A valid, unique-per-call ISBN-13 (978 + 9 random digits + check digit). */
export function randomIsbn13(): string {
  const digits = '978' + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return digits + ((10 - (sum % 10)) % 10);
}

/** A valid, unique-per-call ISBN-10. */
export function randomIsbn10(): string {
  for (;;) {
    const nine = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += (10 - i) * Number(nine[i]);
    const check = (11 - (sum % 11)) % 11;
    return nine + (check === 10 ? 'X' : String(check));
  }
}
