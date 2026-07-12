import { setTimeout as delay } from "node:timers/promises"

import { OutboxWorker } from "@/src/server/application/outbox/outbox-worker"
import { getServerEnv } from "@/src/server/infrastructure/config/env"
import {
  ensureDatabaseReady,
  prisma,
} from "@/src/server/infrastructure/database/prisma"
import { ResendEmailGateway } from "@/src/server/infrastructure/email/resend-email-gateway"
import { logger } from "@/src/server/infrastructure/observability/logger"

const env = getServerEnv()
await ensureDatabaseReady()
const worker = new OutboxWorker(
  prisma,
  new ResendEmailGateway(env.RESEND_API_KEY, env.EMAIL_FROM),
  env.OUTBOX_ENCRYPTION_KEY,
  env.OUTBOX_BATCH_SIZE
)

let stopping = false
process.on("SIGINT", () => (stopping = true))
process.on("SIGTERM", () => (stopping = true))

logger.info("worker.started")
while (!stopping) {
  const processed = await worker.runOnce()
  if (processed === 0) await delay(env.OUTBOX_POLL_INTERVAL_MS)
}
await prisma.$disconnect()
logger.info("worker.stopped")
