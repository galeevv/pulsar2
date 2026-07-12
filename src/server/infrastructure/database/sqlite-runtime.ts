import type { PrismaClient } from "@/generated/prisma/client"

export async function configureSqlite(client: PrismaClient): Promise<void> {
  await client.$queryRawUnsafe("PRAGMA journal_mode = WAL")
  await client.$queryRawUnsafe("PRAGMA foreign_keys = ON")
  await client.$queryRawUnsafe("PRAGMA busy_timeout = 5000")
  await client.$queryRawUnsafe("PRAGMA synchronous = NORMAL")
}
