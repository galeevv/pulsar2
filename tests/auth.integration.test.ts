import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test, { type TestContext } from "node:test"

import { AuthService } from "@/src/server/application/auth/auth-service"
import { AppError } from "@/src/server/domain/errors"
import { decryptJson } from "@/src/server/infrastructure/crypto/secure-tokens"
import type { LoginEmailMessage } from "@/src/server/infrastructure/email/email-gateway"
import { createTestDatabase } from "@/tests/helpers/test-database"

const encryptionKey = Buffer.alloc(32, 9).toString("base64")

async function setup(context: TestContext) {
  const { db } = await createTestDatabase(context)
  const auth = new AuthService(db, {
    appUrl: new URL("https://app.pulsar-cloud.space"),
    tokenSecret: "integration-test-secret-that-is-long-enough",
    outboxEncryptionKey: encryptionKey,
    otpTtlSeconds: 600,
    magicLinkTtlSeconds: 600,
    sessionTtlDays: 180,
    maxAttempts: 5,
    emailRateLimit: 20,
    ipRateLimit: 50,
    rateLimitWindowSeconds: 900,
    resendCooldownSeconds: 0,
  })
  const requestContext = {
    correlationId: randomUUID(),
    ipAddress: "203.0.113.7",
    userAgent: "Pulsar integration test",
  }
  return { auth, db, requestContext }
}

async function latestEmail(db: Awaited<ReturnType<typeof setup>>["db"]) {
  const event = await db.outboxEvent.findFirstOrThrow({
    orderBy: { createdAt: "desc" },
  })
  const message = decryptJson<LoginEmailMessage>(
    event.encryptedPayload,
    encryptionKey
  )
  return { event, message }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof AppError && error.code === code
}

test("OTP creates identity and a 180-day hash-only session", async (context) => {
  const { auth, db, requestContext } = await setup(context)
  await auth.requestEmailLogin(" User@Example.com ", requestContext)
  const { event, message } = await latestEmail(db)
  assert.equal(message.to, "user@example.com")
  assert.ok(!event.encryptedPayload.includes(message.otp))

  const session = await auth.verifyEmailOtp(
    message.to,
    message.otp,
    requestContext
  )
  const persisted = await db.session.findFirstOrThrow()
  assert.notEqual(persisted.tokenHash, session.token)
  assert.equal(
    Math.round((session.expiresAt.getTime() - Date.now()) / 86_400_000),
    180
  )
  const authenticated = await auth.authenticateSession(session.token)
  assert.equal(authenticated.email, "user@example.com")
  assert.equal(await db.user.count(), 1)
  assert.equal(await db.authIdentity.count(), 1)
  await assert.rejects(
    auth.verifyEmailOtp(message.to, message.otp, requestContext),
    (error) => expectCode(error, "CHALLENGE_USED")
  )
})

test("OTP attempts are limited and challenge cannot recover", async (context) => {
  const { auth, db, requestContext } = await setup(context)
  await auth.requestEmailLogin("attempts@example.com", requestContext)
  const { message } = await latestEmail(db)
  const wrongOtp = message.otp === "000000" ? "000001" : "000000"
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(
      auth.verifyEmailOtp("attempts@example.com", wrongOtp, requestContext),
      (error) => expectCode(error, "CHALLENGE_INVALID")
    )
  }
  await assert.rejects(
    auth.verifyEmailOtp("attempts@example.com", wrongOtp, requestContext),
    (error) => expectCode(error, "CHALLENGE_ATTEMPTS_EXHAUSTED")
  )
  await assert.rejects(
    auth.verifyEmailOtp("attempts@example.com", wrongOtp, requestContext),
    (error) => expectCode(error, "CHALLENGE_ATTEMPTS_EXHAUSTED")
  )
})

test("parallel invalid OTP requests cannot bypass the attempt limit", async (context) => {
  const { auth, db, requestContext } = await setup(context)
  await auth.requestEmailLogin("parallel-attempts@example.com", requestContext)
  const { message } = await latestEmail(db)
  const wrongOtp = message.otp === "111111" ? "222222" : "111111"

  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      auth.verifyEmailOtp(message.to, wrongOtp, requestContext)
    )
  )
  assert.equal(
    results.every((result) => result.status === "rejected"),
    true
  )
  const challenge = await db.loginChallenge.findFirstOrThrow({
    where: { subject: message.to },
  })
  assert.equal(challenge.attempts, challenge.maxAttempts)
  await assert.rejects(
    auth.verifyEmailOtp(message.to, message.otp, requestContext),
    (error) => expectCode(error, "CHALLENGE_ATTEMPTS_EXHAUSTED")
  )
})

test("magic link is single-use under concurrent requests", async (context) => {
  const { auth, db, requestContext } = await setup(context)
  await auth.requestEmailLogin("race@example.com", requestContext)
  const { message } = await latestEmail(db)
  const url = new URL(message.magicUrl)
  const challenge = url.searchParams.get("challenge")!
  const token = url.searchParams.get("token")!

  const results = await Promise.allSettled([
    auth.verifyMagicLink(challenge, token, requestContext),
    auth.verifyMagicLink(challenge, token, requestContext),
  ])
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  )
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1
  )
  const rejected = results.find((result) => result.status === "rejected")
  assert.ok(rejected && expectCode(rejected.reason, "CHALLENGE_USED"))
  assert.equal(await db.session.count(), 1)
})

test("expired magic links and sessions are rejected", async (context) => {
  const { auth, db, requestContext } = await setup(context)
  await auth.requestEmailLogin("expired@example.com", requestContext)
  const { message } = await latestEmail(db)
  const url = new URL(message.magicUrl)
  const challenge = url.searchParams.get("challenge")!
  const token = url.searchParams.get("token")!
  await db.loginChallenge.update({
    where: { id: challenge },
    data: { expiresAt: new Date(Date.now() - 1000) },
  })
  await assert.rejects(
    auth.verifyMagicLink(challenge, token, requestContext),
    (error) => expectCode(error, "CHALLENGE_EXPIRED")
  )

  await auth.requestEmailLogin("session-expired@example.com", requestContext)
  const next = await latestEmail(db)
  const session = await auth.verifyEmailOtp(
    next.message.to,
    next.message.otp,
    requestContext
  )
  await db.session.updateMany({
    data: { expiresAt: new Date(Date.now() - 1000) },
  })
  await assert.rejects(auth.authenticateSession(session.token), (error) =>
    expectCode(error, "UNAUTHENTICATED")
  )
})

test("logout revokes only the presented session", async (context) => {
  const { auth, db, requestContext } = await setup(context)
  await auth.requestEmailLogin("sessions@example.com", requestContext)
  const firstEmail = await latestEmail(db)
  const first = await auth.verifyEmailOtp(
    firstEmail.message.to,
    firstEmail.message.otp,
    requestContext
  )
  await auth.requestEmailLogin("sessions@example.com", requestContext)
  const secondEmail = await latestEmail(db)
  const second = await auth.verifyEmailOtp(
    secondEmail.message.to,
    secondEmail.message.otp,
    requestContext
  )

  await auth.logoutCurrentSession(first.token, requestContext)
  await assert.rejects(auth.authenticateSession(first.token), (error) =>
    expectCode(error, "UNAUTHENTICATED")
  )
  assert.equal(
    (await auth.authenticateSession(second.token)).userId,
    second.userId
  )
  assert.equal(await db.session.count({ where: { revokedAt: null } }), 1)
})

test("email and IP request rate limits persist in SQLite", async (context) => {
  const { db } = await createTestDatabase(context)
  const auth = new AuthService(db, {
    appUrl: new URL("https://app.pulsar-cloud.space"),
    tokenSecret: "rate-limit-test-secret-that-is-long-enough",
    outboxEncryptionKey: encryptionKey,
    otpTtlSeconds: 600,
    magicLinkTtlSeconds: 600,
    sessionTtlDays: 180,
    maxAttempts: 5,
    emailRateLimit: 2,
    ipRateLimit: 20,
    rateLimitWindowSeconds: 900,
    resendCooldownSeconds: 0,
  })
  const requestContext = {
    correlationId: randomUUID(),
    ipAddress: "198.51.100.4",
  }
  await auth.requestEmailLogin("limited@example.com", requestContext)
  await auth.requestEmailLogin("limited@example.com", requestContext)
  await assert.rejects(
    auth.requestEmailLogin("limited@example.com", requestContext),
    (error) => expectCode(error, "RATE_LIMITED")
  )
  assert.equal(await db.outboxEvent.count(), 2)
})

test("resend cooldown is enforced in the application layer", async (context) => {
  const { db } = await createTestDatabase(context)
  const auth = new AuthService(db, {
    appUrl: new URL("https://app.pulsar-cloud.space"),
    tokenSecret: "resend-cooldown-secret-that-is-long-enough",
    outboxEncryptionKey: encryptionKey,
    otpTtlSeconds: 600,
    magicLinkTtlSeconds: 600,
    sessionTtlDays: 180,
    maxAttempts: 5,
    emailRateLimit: 20,
    ipRateLimit: 50,
    rateLimitWindowSeconds: 900,
    resendCooldownSeconds: 60,
  })
  const requestContext = {
    correlationId: randomUUID(),
    ipAddress: "198.51.100.12",
  }

  await auth.requestEmailLogin("cooldown@example.com", requestContext)
  await assert.rejects(
    auth.requestEmailLogin("cooldown@example.com", requestContext),
    (error) =>
      error instanceof AppError &&
      error.code === "RATE_LIMITED" &&
      error.retryAfterSeconds !== undefined &&
      error.retryAfterSeconds >= 59 &&
      error.retryAfterSeconds <= 60
  )
  assert.equal(await db.outboxEvent.count(), 1)
})
