import assert from "node:assert/strict"
import test from "node:test"

import { createTestDatabase } from "@/tests/helpers/test-database"

test("SQLite runtime enables WAL, foreign keys, and busy timeout", async (context) => {
  const { db } = await createTestDatabase(context)
  const journal = await db.$queryRawUnsafe<Array<{ journal_mode: string }>>(
    "PRAGMA journal_mode"
  )
  const foreignKeys = await db.$queryRawUnsafe<Array<{ foreign_keys: bigint }>>(
    "PRAGMA foreign_keys"
  )
  const busyTimeout = await db.$queryRawUnsafe<Array<{ timeout: bigint }>>(
    "PRAGMA busy_timeout"
  )
  assert.equal(journal[0]?.journal_mode.toLowerCase(), "wal")
  assert.equal(Number(foreignKeys[0]?.foreign_keys), 1)
  assert.equal(Number(busyTimeout[0]?.timeout), 5000)
})

test("database rejects orphan identities", async (context) => {
  const { db } = await createTestDatabase(context)
  await assert.rejects(
    db.authIdentity.create({
      data: {
        userId: "missing-user",
        provider: "EMAIL",
        providerSubject: "orphan@example.com",
        verifiedAt: new Date(),
      },
    })
  )
})
