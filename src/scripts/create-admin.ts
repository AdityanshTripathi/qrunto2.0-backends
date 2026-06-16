import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

async function run() {
  const email = 'shouyak530@gmail.com';
  const password = 'shourya';
  const name = 'Shourya';

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: UserRole.SUPER_ADMIN,
          password: passwordHash,
          name
        }
      });
      console.log(`Updated existing user "${email}" to SUPER_ADMIN with password "${password}"`);
    } else {
      await prisma.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          role: UserRole.SUPER_ADMIN
        }
      });
      console.log(`Created new SUPER_ADMIN user "${email}" with password "${password}"`);
    }
  } catch (error: any) {
    console.error('Failed to create/update admin user:', error.message);
  } finally {
    process.exit(0);
  }
}

run();
