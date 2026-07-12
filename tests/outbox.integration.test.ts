import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"

import { AuthService } from "@/src/server/application/auth/auth-service"
import { OutboxWorker } from "@/src/server/application/outbox/outbox-worker"
import { AppError } from "@/src/server/domain/errors"
import type {
  EmailGateway,
  LoginEmailMessage,
} from "@/src/server/infrastructure/email/email-gateway"
import { createTestDatabase } from "@/tests/helpers/test-database"

const encryptionKey = Buffer.alloc(32, 11).toString("base64")

class RecordingEmailGateway implements EmailGateway {
  calls: Array<{ message: LoginEmailMessage; idempotencyKey: string }> = []
  failuresRemaining = 0

  async sendLoginEmail(message: LoginEmailMessage, idempotencyKey: string) {
    this.calls.push({ message, idempotencyKey })
    if (this.failuresRemaining-- > 0) {
      throw new AppError("PROVIDER_UNAVAILABLE", { retryable: true })
    }
    return "resend-message-id"
  }
}

test("outbox retries with one stable idempotency key and deduplicates success", async (context) => {
  const { db } = await createTestDatabase(context)
  const auth = new AuthService(db, {
    appUrl: new URL("https://app.pulsar-cloud.space"),
    tokenSecret: "outbox-test-token-secret-that-is-long-enough",
    outboxEncryptionKey: encryptionKey,
    otpTtlSeconds: 600,
    magicLinkTtlSeconds: 600,
    sessionTtlDays: 180,
    maxAttempts: 5,
    emailRateLimit: 5,
    ipRateLimit: 20,
    rateLimitWindowSeconds: 900,
    resendCooldownSeconds: 0,
  })
  await auth.requestEmailLogin("outbox@example.com", {
    correlationId: randomUUID(),
    ipAddress: "203.0.113.8",
  })

  const gateway = new RecordingEmailGateway()
  gateway.failuresRemaining = 1
  const worker = new OutboxWorker(db, gateway, encryptionKey, 10)
  const firstRun = new Date()
  assert.equal(await worker.runOnce(firstRun), 1)
  const retry = await db.outboxEvent.findFirstOrThrow()
  assert.equal(retry.status, "PENDING")
  assert.equal(retry.attempts, 1)

  assert.equal(await worker.runOnce(new Date(firstRun.getTime() + 6000)), 1)
  const sent = await db.outboxEvent.findFirstOrThrow()
  assert.equal(sent.status, "SENT")
  assert.equal(sent.providerMessageId, "resend-message-id")
  assert.equal(gateway.calls.length, 2)
  assert.equal(
    gateway.calls[0]?.idempotencyKey,
    gateway.calls[1]?.idempotencyKey
  )

  assert.equal(await worker.runOnce(new Date(firstRun.getTime() + 12_000)), 0)
  assert.equal(gateway.calls.length, 2)
})

test("worker does not send a challenge after its TTL", async (context) => {
  const { db } = await createTestDatabase(context)
  const gateway = new RecordingEmailGateway()
  const expiredMessage: LoginEmailMessage = {
    kind: "AUTH_LOGIN_EMAIL",
    to: "expired@example.com",
    otp: "123456",
    magicUrl: "https://app.pulsar-cloud.space/auth/verify/link",
    expiresInMinutes: 10,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  }
  const { encryptJson } =
    await import("@/src/server/infrastructure/crypto/secure-tokens")
  await db.outboxEvent.create({
    data: {
      type: "AUTH_LOGIN_EMAIL",
      encryptedPayload: encryptJson(expiredMessage, encryptionKey),
      deduplicationKey: "expired/test",
      correlationId: randomUUID(),
    },
  })

  const worker = new OutboxWorker(db, gateway, encryptionKey, 10)
  assert.equal(await worker.runOnce(), 1)
  assert.equal(gateway.calls.length, 0)
  const event = await db.outboxEvent.findFirstOrThrow()
  assert.equal(event.status, "FAILED")
  assert.equal(event.lastErrorCode, "CHALLENGE_EXPIRED")
})
