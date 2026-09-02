import 'dotenv/config';
import { pool, prisma } from '../lib/prisma';

type ConnectionCheck = {
  database: string;
  user: string;
  server_version: string;
  public_tables: string;
};

async function main() {
  const client = await pool.connect();
  let result: ConnectionCheck | undefined;
  let tlsEnabled = false;

  try {
    const stream = (
      client as unknown as { connection?: { stream?: { encrypted?: boolean } } }
    ).connection?.stream;
    tlsEnabled = stream?.encrypted === true;

    const query = await client.query<ConnectionCheck>(`
      SELECT
        current_database() AS database,
        current_user AS "user",
        current_setting('server_version') AS server_version,
        (
          SELECT COUNT(*)
          FROM information_schema.tables
          WHERE table_schema = 'public'
        ) AS public_tables
    `);
    result = query.rows[0];
  } finally {
    client.release();
  }

  if (!result) {
    throw new Error('Database connection succeeded but returned no health-check result.');
  }

  console.log('Supabase database connection verified.');
  console.log(`Database: ${result.database}`);
  console.log(`Role: ${result.user}`);
  console.log(`Postgres: ${result.server_version}`);
  if (!tlsEnabled) {
    throw new Error('Database connection is not using TLS.');
  }

  console.log('TLS: enabled');
  console.log(`Public tables: ${result.public_tables}`);
}

main()
  .catch((error: unknown) => {
    console.error('Supabase database connection check failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
