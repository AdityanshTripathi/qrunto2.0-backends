import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import { decimal, money as roundMoney, moneyNumber, type MoneyInput } from '../lib/money';

export { BusinessDateError as AnalyticsDateError } from '../lib/timezone';
import { dateRange } from '../lib/timezone';
export function analyticsDates(startDate: unknown, endDate: unknown, now = new Date(), zone = 'UTC') {
  return dateRange(startDate, endDate, zone, now);
}
type Range = ReturnType<typeof analyticsDates>;
const money = (value: MoneyInput) => moneyNumber(roundMoney(value));

export async function inventoryAnalytics(restaurantId: string, range: Range) {
  const [materials, wastage, usage] = await Promise.all([
    prisma.rawMaterial.findMany({ where: { restaurantId }, select: {
      id: true, name: true, unit: true, currentStock: true, minimumStockLevel: true,
      averageCost: true, purchasePrice: true, status: true,
    } }),
    prisma.wastageRecord.aggregate({ where: { restaurantId, rawMaterial: { restaurantId }, wasteDate: range }, _sum: { cost: true } }),
    prisma.stockLedger.groupBy({ by: ['rawMaterialId'], where: {
      restaurantId, rawMaterial: { restaurantId }, actionType: 'SALE_DEDUCTION', createdAt: range, quantity: { lt: 0 },
    }, _sum: { quantity: true } }),
  ]);
  const byId = new Map(materials.map(material => [material.id, material]));
  const active = materials.filter(material => material.status === 'ACTIVE');
  // Zero is a valid recorded cost; do not replace it with a purchase quote.
  const cost = (material: typeof materials[number]) => material.averageCost ?? material.purchasePrice;
  const consumption = usage.flatMap(group => {
    const material = byId.get(group.rawMaterialId);
    if (!material) return [];
    const quantity = -(group._sum.quantity ?? 0);
    return [{ materialId: material.id, materialName: material.name, quantity, unit: material.unit, cost: money(decimal(quantity).times(cost(material))) }];
  }).sort((a, b) => b.cost - a.cost || a.materialId.localeCompare(b.materialId));
  const used = new Set(consumption.map(row => row.materialId));
  return {
    value: { totalStockValue: money(active.reduce((sum, material) => sum.plus(decimal(material.currentStock).times(cost(material))), decimal(0))), wastageCost: money(wastage._sum.cost ?? 0) },
    consumption,
    turnover: consumption.map(row => {
      const stock = byId.get(row.materialId)!.currentStock;
      return { materialId: row.materialId, materialName: row.materialName, turnoverRatio: stock > 0 ? Number((row.quantity / stock).toFixed(1)) : null };
    }),
    lowStockCount: active.filter(material => material.currentStock <= material.minimumStockLevel).length,
    outOfStockCount: active.filter(material => material.currentStock <= 0).length,
    deadStockCount: active.filter(material => material.currentStock > 0 && !used.has(material.id)).length,
  };
}

export async function financialAnalytics(restaurantId: string, range: Range) {
  const orders: Prisma.OrderWhereInput = { restaurantId, status: { in: ['SERVED', 'PAID'] }, createdAt: range };
  const [sales, refunds, expenses, payments, soldItems, recipes] = await Promise.all([
    prisma.order.aggregate({ where: orders, _sum: { subtotal: true, taxAmount: true, totalAmount: true }, _count: { id: true } }),
    prisma.payment.aggregate({ where: { restaurantId, order: orders, status: { in: ['SUCCESS', 'REFUNDED'] } }, _sum: { refundedAmount: true } }),
    prisma.expenses.groupBy({ by: ['category'], where: { restaurant_id: restaurantId, expense_date: range }, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ['paymentMethod'], where: {
      restaurantId, order: orders, status: { in: ['SUCCESS', 'REFUNDED'] },
    }, _sum: { amount: true, refundedAmount: true } }),
    prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: { order: orders },
      _sum: { quantity: true },
    }),
    prisma.recipe.findMany({
      where: { menuItem: { restaurantId } },
      select: {
        menuItemId: true,
        ingredients: {
          select: {
            quantity: true,
            rawMaterial: {
              select: { averageCost: true, purchasePrice: true, unit: true },
            },
          },
        },
      },
    }),
  ]);
  const gross = decimal(sales._sum.subtotal ?? 0).plus(sales._sum.taxAmount ?? 0);
  const total = sales._sum.totalAmount ?? 0;
  const refunded = refunds._sum.refundedAmount ?? 0;
  const net = decimal(total).minus(refunded);
  const expenseTotal = expenses.reduce((sum, row) => sum.plus(row._sum.amount ?? 0), decimal(0));

  const recipesByMenuItem = new Map(recipes.map(recipe => [recipe.menuItemId, recipe]));
  let estimatedCogs = decimal(0);

  for (const sold of soldItems) {
    if (!sold.menuItemId) continue;
    const recipe = recipesByMenuItem.get(sold.menuItemId);
    if (!recipe) continue;

    let unitCost = decimal(0);
    for (const ingredient of recipe.ingredients) {
      const materialUnit = (ingredient.rawMaterial.unit || '').toUpperCase().trim();
      const conversionFactor =
        materialUnit === 'KG' || materialUnit === 'LTR' || materialUnit === 'L'
          ? 1000
          : 1;

      const normalizedQuantity = decimal(ingredient.quantity).dividedBy(conversionFactor);
      unitCost = unitCost.plus(
        normalizedQuantity.times(
          ingredient.rawMaterial.averageCost ?? ingredient.rawMaterial.purchasePrice ?? 0
        )
      );
    }

    estimatedCogs = estimatedCogs.plus(
      unitCost.times(sold._sum.quantity ?? 0)
    );
  }

  const grossProfit = net.minus(estimatedCogs);
  const operatingProfit = grossProfit.minus(expenseTotal);
  const paymentMethods = { upi: 0, cash: 0, card: 0, other: 0 };
  for (const row of payments) {
    const method = row.paymentMethod?.trim().toLowerCase();
    const key = method === 'upi' || method === 'cash' || method === 'card' ? method
      : method === 'credit_card' || method === 'debit_card' ? 'card' : 'other';
    paymentMethods[key] = moneyNumber(decimal(paymentMethods[key]).plus(row._sum.amount ?? 0).minus(row._sum.refundedAmount ?? 0));
  }
  for (const key of Object.keys(paymentMethods) as (keyof typeof paymentMethods)[]) paymentMethods[key] = money(paymentMethods[key]);
  return {
    summary: {
      gross: money(gross),
      net: money(net),
      expenses: money(expenseTotal),
      cogs: money(estimatedCogs),
      grossProfit: money(grossProfit),
      operatingProfit: money(operatingProfit),
      profit: money(operatingProfit),
      gst: money(sales._sum.taxAmount ?? 0),
      grossMargin: net.gt(0) ? Number(grossProfit.dividedBy(net).times(100).toFixed(1)) : 0,
      operatingMargin: net.gt(0) ? Number(operatingProfit.dividedBy(net).times(100).toFixed(1)) : 0,
      costBasis: 'estimated_current_recipe_cost',
      orders: sales._count.id,
      discounts: money(gross.minus(total)),
      refunds: money(refunded),
    },
    paymentMethods,
    expenseBreakdown: expenses.map(row => ({ category: row.category.toLowerCase(), amount: money(row._sum.amount ?? 0) }))
      .filter(row => row.amount !== 0).sort((a, b) => a.category.localeCompare(b.category)),
  };
}
