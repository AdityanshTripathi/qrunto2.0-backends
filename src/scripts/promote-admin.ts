import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Please specify an email address. Example: npx ts-node src/scripts/promote-admin.ts email@example.com');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.error(`User with email "${email}" not found.`);
      process.exit(1);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.SUPER_ADMIN }
    });

    console.log(`Successfully promoted "${email}" to SUPER_ADMIN!`);
  } catch (error: any) {
    console.error('Failed to promote user:', error.message);
  } finally {
    process.exit(0);
  }
}

run();
