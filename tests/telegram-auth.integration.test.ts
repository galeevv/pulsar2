import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test, { type TestContext } from "node:test"

import {
  TelegramAuthService,
  type TelegramOidcGateway,
} from "@/src/server/application/auth/telegram-auth-service"
import { AppError } from "@/src/server/domain/errors"
import { createTestDatabase } from "@/tests/helpers/test-database"

const encryptionKey = Buffer.alloc(32, 13).toString("base64")

class FakeTelegramOidc implements TelegramOidcGateway {
  subject = "telegram-user-1"
  private nonce = ""

  createAuthorizationUrl(input: {
    state: string
    nonce: string
    codeChallenge: string
  }) {
    this.nonce = input.nonce
    const url = new URL("https://oauth.telegram.test/auth")
    url.searchParams.set("state", input.state)
    url.searchParams.set("code_challenge", input.codeChallenge)
    return url
  }

  async exchangeAndVerify(input: {
    code: string
    codeVerifier: string
    nonce: string
  }) {
    assert.equal(input.code, "valid-code")
    assert.equal(input.nonce, this.nonce)
    assert.ok(input.codeVerifier.length >= 43)
    return {
      subject: this.subject,
      username: "pulsar_test",
      displayName: "Pulsar Test",
    }
  }
}

async function setup(context: TestContext) {
  const { db } = await createTestDatabase(context)
  const oidc = new FakeTelegramOidc()
  const telegram = new TelegramAuthService(db, oidc, {
    tokenSecret: "telegram-test-secret-that-is-long-enough",
    encryptionKey,
    sessionTtlDays: 180,
    challengeTtlSeconds: 600,
  })
  const requestContext = {
    correlationId: randomUUID(),
    ipAddress: "203.0.113.20",
    userAgent: "Telegram integration test",
  }
  return { db, oidc, telegram, requestContext }
}

async function completeStartedFlow(
  telegram: TelegramAuthService,
  requestContext: Awaited<ReturnType<typeof setup>>["requestContext"],
  intent: "link" | "login",
  userId?: string
) {
  const started = await telegram.begin(intent, userId, requestContext)
  const state = started.authorizationUrl.searchParams.get("state")!
  return telegram.complete(
    "valid-code",
    state,
    started.browserBindingToken,
    userId,
    requestContext
  )
}

test("Telegram login creates a hash-only session and reuses its identity", async (context) => {
  const { db, telegram, requestContext } = await setup(context)
  const first = await completeStartedFlow(telegram, requestContext, "login")
  assert.equal(first.kind, "login")
  if (first.kind !== "login") return
  const stored = await db.session.findFirstOrThrow()
  assert.notEqual(stored.tokenHash, first.session.token)

  const second = await completeStartedFlow(telegram, requestContext, "login")
  assert.equal(second.kind, "login")
  if (second.kind !== "login") return
  assert.equal(second.session.userId, first.session.userId)
  assert.equal(await db.user.count(), 1)
  assert.equal(await db.authIdentity.count(), 1)
})

test("Telegram callback is bound to the browser that started login", async (context) => {
  const { telegram, requestContext } = await setup(context)
  const started = await telegram.begin("login", undefined, requestContext)
  const state = started.authorizationUrl.searchParams.get("state")!
  await assert.rejects(
    telegram.complete(
      "valid-code",
      state,
      undefined,
      undefined,
      requestContext
    ),
    (error) =>
      error instanceof AppError && error.code === "TELEGRAM_AUTH_FAILED"
  )
})

test("linked Telegram identity logs into the existing email user", async (context) => {
  const { db, telegram, requestContext } = await setup(context)
  const emailUser = await db.user.create({
    data: {
      email: "linked@example.com",
      identities: {
        create: {
          provider: "EMAIL",
          providerSubject: "linked@example.com",
          verifiedAt: new Date(),
        },
      },
    },
  })

  const linked = await completeStartedFlow(
    telegram,
    requestContext,
    "link",
    emailUser.id
  )
  assert.deepEqual(linked, { kind: "linked", userId: emailUser.id })
  const login = await completeStartedFlow(telegram, requestContext, "login")
  assert.equal(login.kind, "login")
  if (login.kind === "login") assert.equal(login.session.userId, emailUser.id)
  assert.equal(await db.user.count(), 1)
  assert.equal(await db.authIdentity.count(), 2)
})

test("linking never merges two already registered accounts", async (context) => {
  const { db, telegram, requestContext } = await setup(context)
  const emailUser = await db.user.create({
    data: {
      email: "separate@example.com",
      identities: {
        create: {
          provider: "EMAIL",
          providerSubject: "separate@example.com",
          verifiedAt: new Date(),
        },
      },
    },
  })
  await completeStartedFlow(telegram, requestContext, "login")

  await assert.rejects(
    completeStartedFlow(telegram, requestContext, "link", emailUser.id),
    (error) =>
      error instanceof AppError && error.code === "IDENTITY_ALREADY_LINKED"
  )
  assert.equal(await db.user.count(), 2)
  assert.equal(await db.authIdentity.count(), 2)
  assert.equal(
    await db.authIdentity.count({ where: { userId: emailUser.id } }),
    1
  )
})
