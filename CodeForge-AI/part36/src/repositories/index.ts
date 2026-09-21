import { env } from '../config/env';
import { createMemoryRepositories } from './memory';
import type { Repositories } from './types';

let prismaClientInstance: { $disconnect: () => Promise<void> } | null = null;

function buildRepositories(): Repositories {
  if (env.DATABASE_PROVIDER === 'memory') {
    return createMemoryRepositories();
  }

  // Lazily required so `@prisma/client` / a live DB connection is only
  // ever touched when explicitly configured — keeps `npm run dev` and
  // `npm test` fully usable with zero external infrastructure.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createPrismaRepositories } = require('./prisma');
  const prisma = new PrismaClient();
  prismaClientInstance = prisma;
  return createPrismaRepositories(prisma);
}

export const repositories: Repositories = buildRepositories();

export async function disconnectRepositories(): Promise<void> {
  if (prismaClientInstance) await prismaClientInstance.$disconnect();
}
