import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Please specify an email address. Example: npx ts-node src/scripts/promote-admin.ts email@example.com');
    process.exitCode = 1;
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.error('User not found.');
      process.exitCode = 1;
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.SUPER_ADMIN }
    });

    console.log('Successfully promoted user to SUPER_ADMIN.');
  } catch {
    console.error('Failed to promote user. Details withheld.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
