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

export const pool = new Pool({ connectionString: sslConnectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
