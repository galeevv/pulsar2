import type { OutboxEvent, PrismaClient } from "@/generated/prisma/client"
import { AppError } from "@/src/server/domain/errors"
import { decryptJson } from "@/src/server/infrastructure/crypto/secure-tokens"
import type {
  EmailGateway,
  LoginEmailMessage,
} from "@/src/server/infrastructure/email/email-gateway"
import { logger } from "@/src/server/infrastructure/observability/logger"

export class OutboxWorker {
  constructor(
    private readonly db: PrismaClient,
    private readonly email: EmailGateway,
    private readonly encryptionKey: string,
    private readonly batchSize: number
  ) {}

  async runOnce(now = new Date()): Promise<number> {
    const staleBefore = new Date(now.getTime() - 5 * 60 * 1000)
    const candidates = await this.db.outboxEvent.findMany({
      where: {
        OR: [
          { status: "PENDING", availableAt: { lte: now } },
          { status: "PROCESSING", lockedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: this.batchSize,
    })

    let processed = 0
    for (const candidate of candidates) {
      const event = await this.claim(candidate, now, staleBefore)
      if (!event) continue
      processed += 1
      await this.deliver(event, now)
    }
    return processed
  }

  private async claim(
    candidate: OutboxEvent,
    now: Date,
    staleBefore: Date
  ): Promise<OutboxEvent | null> {
    const claimed = await this.db.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: "PENDING", availableAt: { lte: now } },
          { status: "PROCESSING", lockedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: "PROCESSING",
        lockedAt: now,
        attempts: { increment: 1 },
      },
    })
    if (claimed.count !== 1) return null
    return this.db.outboxEvent.findUniqueOrThrow({
      where: { id: candidate.id },
    })
  }

  private async deliver(event: OutboxEvent, now: Date): Promise<void> {
    try {
      if (event.type !== "AUTH_LOGIN_EMAIL") {
        throw new AppError("INTERNAL_ERROR", {
          message: `Unsupported outbox event type: ${event.type}`,
        })
      }
      const payload = decryptJson<LoginEmailMessage>(
        event.encryptedPayload,
        this.encryptionKey
      )
      if (new Date(payload.expiresAt) <= now) {
        await this.db.outboxEvent.updateMany({
          where: { id: event.id, status: "PROCESSING" },
          data: {
            status: "FAILED",
            lockedAt: null,
            lastErrorCode: "CHALLENGE_EXPIRED",
          },
        })
        logger.warn("outbox.expired", {
          eventId: event.id,
          eventType: event.type,
          correlationId: event.correlationId,
        })
        return
      }
      const providerMessageId = await this.email.sendLoginEmail(
        payload,
        `outbox/${event.id}`
      )
      await this.db.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING" },
        data: {
          status: "SENT",
          sentAt: now,
          lockedAt: null,
          providerMessageId,
          lastErrorCode: null,
        },
      })
      logger.info("outbox.delivered", {
        eventId: event.id,
        eventType: event.type,
        correlationId: event.correlationId,
      })
    } catch (error) {
      const terminal = event.attempts >= event.maxAttempts
      const delaySeconds = Math.min(
        3600,
        5 * 2 ** Math.max(0, event.attempts - 1)
      )
      await this.db.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING" },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          lockedAt: null,
          availableAt: new Date(now.getTime() + delaySeconds * 1000),
          lastErrorCode:
            error instanceof AppError ? error.code : "PROVIDER_UNAVAILABLE",
        },
      })
      logger.error("outbox.delivery_failed", {
        eventId: event.id,
        eventType: event.type,
        correlationId: event.correlationId,
        terminal,
      })
    }
  }
}
