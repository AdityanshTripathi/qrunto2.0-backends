import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { pool, prisma } from '../lib/prisma';
import { resolveAccessToken } from '../middlewares/auth.middleware';

type TenantOrder = { id: string; restaurant_id: string };

async function main() {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const tenantOrders = await client.query<TenantOrder>(`
      select distinct on (restaurant_id) id, restaurant_id
      from public.orders
      order by restaurant_id, created_at desc
      limit 2
    `);
    if (tenantOrders.rows.length < 2) {
      throw new Error('Two existing tenants with orders are required for this test.');
    }

    const [tenantA, tenantB] = tenantOrders.rows;
    if (!tenantA || !tenantB || tenantA.restaurant_id === tenantB.restaurant_id) {
      throw new Error('Could not resolve two distinct existing tenants.');
    }

    const identity = await client.query<{ id: string; restaurant_id: string }>(`
      select u.id, coalesce(u.restaurant_id, owned.id) as restaurant_id
      from public.users u
      left join lateral (
        select r.id from public.restaurants r
        where r.owner_id = u.id and r.is_active
        order by r.created_at asc limit 1
      ) owned on true
      where u.is_active is not false
        and coalesce(u.restaurant_id, owned.id) is not null
      limit 1
    `);
    const authenticatedUser = identity.rows[0];
    if (!authenticatedUser || !process.env.JWT_SECRET) {
      throw new Error('An active tenant user and JWT_SECRET are required for this test.');
    }
    const forgedTenantId = authenticatedUser.restaurant_id === tenantA.restaurant_id
      ? tenantB.restaurant_id
      : tenantA.restaurant_id;
    const forgedToken = jwt.sign(
      { id: authenticatedUser.id, restaurantId: forgedTenantId, role: 'SUPER_ADMIN' },
      process.env.JWT_SECRET,
    );
    const resolvedUser = await resolveAccessToken(forgedToken);
    if (resolvedUser.restaurantId !== authenticatedUser.restaurant_id) {
      throw new Error('Client-supplied tenant identity was trusted.');
    }

    const own = await client.query(
      'select 1 from public.orders where id = $1 and restaurant_id = $2',
      [tenantA.id, tenantA.restaurant_id],
    );
    if (own.rowCount !== 1) throw new Error('Tenant A could not read its own order.');

    const cross = await client.query(
      'select 1 from public.orders where id = $1 and restaurant_id = $2',
      [tenantB.id, tenantA.restaurant_id],
    );
    if (cross.rowCount !== 0) throw new Error('Tenant A could read Tenant B order.');

    const update = await client.query(
      'update public.orders set status = status where id = $1 and restaurant_id = $2',
      [tenantB.id, tenantA.restaurant_id],
    );
    if (update.rowCount !== 0) throw new Error('Tenant A could update Tenant B order.');

    const deletion = await client.query(
      'delete from public.orders where id = $1 and restaurant_id = $2',
      [tenantB.id, tenantA.restaurant_id],
    );
    if (deletion.rowCount !== 0) throw new Error('Tenant A could delete Tenant B order.');

    await client.query('savepoint cross_tenant_insert');
    let crossInsertBlocked = false;
    try {
      await client.query(
        `insert into public.payments (
           id, restaurant_id, order_id, amount, refunded_amount, status, created_at, updated_at
         ) values (gen_random_uuid(), $1, $2, 1, 0, 'PENDING', now(), now())`,
        [tenantA.restaurant_id, tenantB.id],
      );
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      crossInsertBlocked = code === '23503';
      await client.query('rollback to savepoint cross_tenant_insert');
      if (!crossInsertBlocked) throw error;
    }
    if (!crossInsertBlocked) throw new Error('Cross-tenant payment insert was not blocked.');

    const privilegeCheck = await client.query<{ exposed: boolean }>(`
      select exists (
        select 1
        from unnest(array['anon', 'authenticated']) role_name,
             unnest(array['orders', 'order_items', 'payments', 'transactions', 'invoices', 'order_status_history']) table_name
        where has_table_privilege(role_name, 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE')
      ) as exposed
    `);
    if (privilegeCheck.rows[0]?.exposed) {
      throw new Error('A browser role still has direct order-data privileges.');
    }

    const rlsCheck = await client.query<{ protected_count: number }>(`
      select count(*)::int as protected_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any(array[
          'orders', 'order_items', 'payments', 'transactions', 'invoices', 'order_status_history'
        ])
        and c.relrowsecurity
    `);
    if (rlsCheck.rows[0]?.protected_count !== 6) {
      throw new Error('RLS is not enabled on every order-related table.');
    }

    console.log('Order tenant security verified with two existing tenants.');
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
