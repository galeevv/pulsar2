import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

import { PrismaClient } from "@/generated/prisma/client"
import { getServerEnv } from "@/src/server/infrastructure/config/env"
import { configureSqlite } from "@/src/server/infrastructure/database/sqlite-runtime"

type PrismaGlobal = typeof globalThis & {
  pulsarPrisma?: PrismaClient
  pulsarPrismaReady?: Promise<void>
}

const prismaGlobal = globalThis as PrismaGlobal

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl })
  return new PrismaClient({ adapter })
}

export const prisma =
  prismaGlobal.pulsarPrisma ?? createPrismaClient(getServerEnv().DATABASE_URL)

if (process.env.NODE_ENV !== "production") prismaGlobal.pulsarPrisma = prisma

export async function ensureDatabaseReady(client = prisma): Promise<void> {
  if (client !== prisma) return configureSqlite(client)

  prismaGlobal.pulsarPrismaReady ??= configureSqlite(client)
  return prismaGlobal.pulsarPrismaReady
}
