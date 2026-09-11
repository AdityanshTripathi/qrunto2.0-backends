import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

async function run() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Super Admin';
  if (!email || !password || password.length < 12) {
    console.error('Set ephemeral ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters); optional ADMIN_NAME. Do not save them in .env.');
    process.exitCode = 1;
    return;
  }

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
      console.log('Updated existing user to SUPER_ADMIN. Password is not logged.');
    } else {
      await prisma.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          role: UserRole.SUPER_ADMIN
        }
      });
      console.log('Created new SUPER_ADMIN user. Credentials are not logged.');
    }
  } catch {
    console.error('Failed to create/update admin user. Details withheld.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
