import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../lib/prisma';

/**
 * One-time CRM v2 cutover. Financial orders/payments/invoices remain intact.
 * Usage: CRM_V2_RESET_BRAND_ID=<uuid> npm run crm:reset-legacy -- --execute --backup=<absolute backup path>
 */
async function main() {
  const brandId = process.env.CRM_V2_RESET_BRAND_ID;
  if (!brandId || !/^[0-9a-f-]{36}$/i.test(brandId)) throw new Error('Set CRM_V2_RESET_BRAND_ID to a brand UUID');
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } });
  if (!brand) throw new Error('Brand not found');
  const [customers, campaigns, segments, coupons, tiers, linkedOrders] = await Promise.all([
    prisma.customer.count({ where: { brandId, crmGeneration: 1 } }),
    prisma.campaign.count({ where: { brandId, crmGeneration: 1 } }),
    prisma.segment.count({ where: { brandId, crmGeneration: 1 } }),
    prisma.coupon.count({ where: { brandId, crmGeneration: 1 } }),
    prisma.loyaltyTier.count({ where: { brandId, crmGeneration: 1 } }),
    prisma.order.count({ where: { customer: { brandId, crmGeneration: 1 } } }),
  ]);
  process.stdout.write(JSON.stringify({ brand: brand.name, brandId, customers, campaigns, segments, coupons, tiers, linkedOrders }) + '\n');
  if (!process.argv.includes('--execute')) return;
  const backupArg = process.argv.find(arg => arg.startsWith('--backup='));
  const backupPath = backupArg?.slice('--backup='.length);
  if (!backupPath || !existsSync(resolve(backupPath))) throw new Error('Provide --backup=<path> to an existing database backup');
  await prisma.$transaction(async tx => {
    // Preserve all order snapshots and financial rows; only remove the CRM foreign key.
    await tx.order.updateMany({ where: { customer: { brandId, crmGeneration: 1 } }, data: { customerId: null } });
    await tx.customer.deleteMany({ where: { brandId, crmGeneration: 1 } });
    await tx.campaign.deleteMany({ where: { brandId, crmGeneration: 1 } });
    await tx.segment.deleteMany({ where: { brandId, crmGeneration: 1 } });
    await tx.coupon.deleteMany({ where: { brandId, crmGeneration: 1 } });
    await tx.loyaltyTier.deleteMany({ where: { brandId, crmGeneration: 1 } });
  }, { timeout: 120_000 });
  process.stdout.write('Legacy CRM data removed for this brand; financial orders and invoices retained.\n');
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
