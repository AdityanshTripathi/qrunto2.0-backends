import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is missing. Copy .env.example to .env and set DATABASE_URL to your PostgreSQL connection string.',
  );
}

// Supabase accepts plaintext Postgres connections unless SSL enforcement is
// enabled. Require TLS client-side even when an older local URL omits sslmode.
const sslConnectionString = /[?&]sslmode=/.test(connectionString)
  ? connectionString
  : `${connectionString}${connectionString.includes('?') ? '&' : '?'}uselibpqcompat=true&sslmode=require`;

function createDatabase() {
  // Prisma URL parameters such as connection_limit do not configure pg.Pool.
  const pool = new Pool({
    connectionString: sslConnectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  return { pool, prisma: new PrismaClient({ adapter }) };
}

// Reuse one pair per process, including development module reloads and warm invocations.
const globalDatabase = globalThis as typeof globalThis & {
  qruntoDatabase?: ReturnType<typeof createDatabase>;
};
const database = globalDatabase.qruntoDatabase ??= createDatabase();

export const { pool, prisma } = database;
