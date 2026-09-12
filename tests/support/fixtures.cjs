'use strict';
const { prisma } = require('./isolation.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Intentionally small Prisma boundary double, not a database/RLS emulator.
function fixtures() {
  let sequence = 100;
  const data = {
    users: [],
    restaurants: [],
    tables: [],
    menu: [],
    orders: [],
    payments: [],
    transactions: [],
    invoices: [],
    authRefreshSessions: [],
  };
  const queries = [];
  const match = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (value.in) return value.in.includes(row[key]);
      return (!value.lt || row[key] < value.lt) && (!value.gte || row[key] >= value.gte) && (!value.lte || row[key] <= value.lte);
    }
    return row[key] === value;
  });
  const copy = row => row ? structuredClone(row) : null;
  const fullUser = row => row ? { ...copy(row), restaurants: data.restaurants.filter(r => r.ownerId === row.id && r.isActive).map(copy) } : null;
  const fullOrder = row => row ? { ...copy(row), table: copy(data.tables.find(t => t.id === row.tableId)), payments: data.payments.filter(p => p.orderId === row.id).map(copy), invoice: copy(data.invoices.find(i => i.orderId === row.id)) } : null;
  const create = (rows, values) => { const row = { id: id(sequence++), ...values }; rows.push(row); return copy(row); };
  prisma.user.findUnique = async ({ where }) => fullUser(data.users.find(row => match(row, where)));
  prisma.user.create = async ({ data: values }) => create(data.users, { isActive: true, restaurantId: null, ...values });
  prisma.waiter.findUnique = async () => null;
  prisma.restaurant.findUnique = async ({ where }) => copy(data.restaurants.find(row => match(row, where)));
  prisma.restaurant.findFirst = async ({ where }) => copy(data.restaurants.find(row => match(row, where)));
  prisma.restaurant.create = async ({ data: values }) => create(data.restaurants, { settings: { taxPercentage: 0 }, ...values });
  prisma.restaurantSetting.create = async ({ data: values }) => copy(values);
  prisma.restaurantSetting.findUnique = async ({ where }) => {
    const restaurant = data.restaurants.find(row => row.id === where.restaurantId);
    return restaurant ? {
      restaurantId: restaurant.id,
      invoiceSeries: restaurant.invoiceSeries ?? 'INV',
    } : null;
  };
  prisma.invoice.upsert = async ({ where, update, create: values }) => {
    let row = data.invoices.find(invoice => invoice.orderId === where.orderId);
    if (row) {
      Object.assign(row, update);
      return copy(row);
    }
    return create(data.invoices, values);
  };
  prisma.invoice.findFirst = async ({ where }) => {
    const row = data.invoices.find(invoice => {
      if (where.orderId && invoice.orderId !== where.orderId) return false;
      if (where.restaurantId && invoice.restaurantId !== where.restaurantId) return false;
      if (where.order?.restaurantId) {
        const order = data.orders.find(order => order.id === invoice.orderId);
        if (!order || order.restaurantId !== where.order.restaurantId) return false;
      }
      return true;
    });
    return copy(row);
  };
  prisma.restaurantTable.findFirst = async ({ where }) => copy(data.tables.find(row => match(row, where)));
  prisma.menuItem.findMany = async ({ where }) => data.menu.filter(row => match(row, where)).map(copy);
  prisma.order.findFirst = async ({ where }) => { queries.push({ operation: 'findFirst', where }); return fullOrder(data.orders.find(row => match(row, where))); };
  prisma.order.findMany = async options => {
    queries.push({ operation: 'findMany', ...options });
    let rows = data.orders.filter(row => match(row, options.where)).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    if (options.cursor) {
      const index = rows.findIndex(row => row.id === options.cursor.id);
      rows = index < 0 ? [] : rows.slice(index + (options.skip || 0));
    }
    return rows.slice(0, options.take).map(fullOrder);
  };
  prisma.order.create = async ({ data: values }) => {
    const row = create(data.orders, { customerId: null, createdAt: new Date(), ...values, orderItems: values.orderItems.create });
    return fullOrder(row);
  };
  prisma.order.updateMany = async ({ where, data: values }) => {
    queries.push({ operation: 'updateMany', where });
    const rows = data.orders.filter(row => match(row, where));
    rows.forEach(row => Object.assign(row, values));
    return { count: rows.length };
  };
  prisma.order.update = async ({ where, data: values }) => {
    const row = data.orders.find(row => match(row, where));
    if (!row) throw new Error('Fixture order missing');
    Object.assign(row, values); return fullOrder(row);
  };
  prisma.order.groupBy = async ({ where }) => {
    queries.push({ operation: 'groupBy', where });
    const counts = {};
    data.orders.filter(row => match(row, where)).forEach(row => { counts[row.status] = (counts[row.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({ status, _count: { status: count } }));
  };
  prisma.notification.create = async ({ data: values }) => copy(values);
  prisma.payment.create = async ({ data: values }) => create(data.payments, values);
  prisma.payment.findFirst = async ({ where }) => copy(data.payments.find(row => match(row, where)));
  prisma.payment.findMany = async ({ where }) => data.payments.filter(row => match(row, where)).map(copy);
  prisma.transaction.create = async ({ data: values }) => create(data.transactions, values);

  prisma.authRefreshSession.create = async ({ data: values }) =>
    create(data.authRefreshSessions, {
      revokedAt: null,
      createdAt: new Date(),
      ...values,
    });

  prisma.authRefreshSession.findUnique = async ({ where }) =>
    copy(
      data.authRefreshSessions.find(row =>
        Object.entries(where).every(
          ([key, value]) => row[key] === value
        )
      )
    );

  prisma.authRefreshSession.updateMany = async ({
    where = {},
    data: values,
  }) => {
    const rows = data.authRefreshSessions.filter(row => {
      if (
        Object.hasOwn(where, 'id') &&
        row.id !== where.id
      ) {
        return false;
      }

      if (
        Object.hasOwn(where, 'tokenHash') &&
        row.tokenHash !== where.tokenHash
      ) {
        return false;
      }

      if (
        Object.hasOwn(where, 'revokedAt') &&
        row.revokedAt !== where.revokedAt
      ) {
        return false;
      }

      if (
        where.expiresAt?.gt &&
        !(row.expiresAt > where.expiresAt.gt)
      ) {
        return false;
      }

      return true;
    });

    rows.forEach(row => Object.assign(row, values));

    return {
      count: rows.length,
    };
  };

  prisma.$transaction = async callback => {
    const snapshot = structuredClone(data);
    try { return await callback(prisma); }
    catch (error) { Object.assign(data, snapshot); throw error; }
  };
  function tenant(number) {
    const restaurant = { id: id(number), timezone: 'UTC', name: `Tenant ${number}`, slug: `tenant-${number}`, ownerId: id(number + 10), isActive: true, settings: { taxPercentage: 10 } };
    const user = { id: restaurant.ownerId, email: `tenant${number}@example.test`, role: 'RESTAURANT_OWNER', restaurantId: restaurant.id, isActive: true };
    const table = { id: id(number + 20), restaurantId: restaurant.id, tableNumber: '1', isActive: true };
    const menu = { id: id(number + 30), restaurantId: restaurant.id, name: 'Test Dish', price: 100, isAvailable: true };
    data.restaurants.push(restaurant); data.users.push(user); data.tables.push(table); data.menu.push(menu);
    return { restaurant, user, table, menu };
  }
  return { data, queries, tenant, id };
}
module.exports = { fixtures, id };
