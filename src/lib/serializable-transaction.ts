import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export async function serializableTransaction<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(action, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';

      const retryable = code === 'P2034' || code === '40001' || code === '40P01';

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 25 * attempt));
    }
  }

  throw new Error('Serializable transaction retry exhausted');
}
