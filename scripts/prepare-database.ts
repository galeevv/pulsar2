import "dotenv/config"

import { mkdirSync } from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl?.startsWith("file:")) {
  throw new Error("DATABASE_URL must be a file: URL for SQLite")
}

const filename = databaseUrl.slice("file:".length).split("?")[0]
if (!filename || filename === ":memory:") process.exit(0)

const absolutePath = path.resolve(filename)
mkdirSync(path.dirname(absolutePath), { recursive: true })
new Database(absolutePath).close()
