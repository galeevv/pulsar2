import { readFileSync, readdirSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { TestContext } from "node:test"

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import Database from "better-sqlite3"

import { PrismaClient } from "@/generated/prisma/client"
import { configureSqlite } from "@/src/server/infrastructure/database/sqlite-runtime"

export async function createTestDatabase(
  context: TestContext
): Promise<{ db: PrismaClient; filename: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pulsar-auth-"))
  const filename = path.join(directory, "test.db")
  const migrationsRoot = path.join(process.cwd(), "prisma/migrations")
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((directory) =>
      readFileSync(
        path.join(migrationsRoot, directory, "migration.sql"),
        "utf8"
      )
    )
  const sqlite = new Database(filename)
  for (const migration of migrations) sqlite.exec(migration)
  sqlite.close()

  const db = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: filename }),
  })
  await configureSqlite(db)
  context.after(async () => {
    await db.$disconnect()
    await rm(directory, { recursive: true, force: true })
  })
  return { db, filename }
}
