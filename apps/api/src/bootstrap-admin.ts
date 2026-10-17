import 'reflect-metadata';
import { parseEnv } from '@library/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';
import { hashPassword } from './auth/auth.service.js';
import { users } from './db/schema.js';

/**
 * Create the first administrator (there is no public sign-up). Run once after migrating:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node dist/bootstrap-admin.js
 * It refuses to run when any administrator already exists.
 */
const env = parseEnv(
  z.object({
    DATABASE_URL: z.string().min(1),
    ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
    ADMIN_PASSWORD: z.string().min(12).max(128),
  }),
);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
try {
  const db = drizzle(pool);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.deletedAt)));
  if (existing) {
    process.stderr.write('An administrator already exists; nothing to do.\n');
    process.exitCode = 1;
  } else {
    await db.insert(users).values({
      email: env.ADMIN_EMAIL,
      passwordHash: await hashPassword(env.ADMIN_PASSWORD),
      firstName: 'Library',
      lastName: 'Administrator',
      role: 'admin',
    });
    process.stdout.write(`Created administrator ${env.ADMIN_EMAIL}\n`);
  }
} finally {
  await pool.end();
}
