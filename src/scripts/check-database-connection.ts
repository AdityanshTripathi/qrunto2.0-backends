import 'dotenv/config';
import assert from 'node:assert/strict';
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

  await prisma.subscriptionPlan.findFirst({ select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await tx.subscriptionPlan.findFirst({ select: { id: true } });
  });
  console.log('Prisma model query and transaction: passed');

  let peakConnections = pool.totalCount;
  const trackConnections = () => {
    peakConnections = Math.max(peakConnections, pool.totalCount);
  };
  pool.on('connect', trackConnections);
  try {
    await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      if (index % 2 === 0) {
        const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
        assert.equal(rows[0]?.ok, 1);
      } else {
        const rows = await pool.query('SELECT 1 AS ok');
        assert.equal(rows.rows[0]?.ok, 1);
      }
      trackConnections();
    }));
    assert.ok(peakConnections <= 1, `Pool exceeded limit: ${peakConnections}`);
    assert.equal(pool.waitingCount, 0);
    console.log(`20 concurrent DB operations: passed; peak connections=${peakConnections}`);
  } finally {
    pool.off('connect', trackConnections);
  }
}

main()
  .catch((error: unknown) => {
    console.error('Supabase database connection check failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
