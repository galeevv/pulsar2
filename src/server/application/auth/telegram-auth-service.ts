import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import {
  AUTH_PROVIDER,
  CHALLENGE_PURPOSE,
  type RequestContext,
} from "@/src/server/domain/auth"
import { AppError, type AppErrorCode } from "@/src/server/domain/errors"
import {
  decryptJson,
  encryptJson,
  generateOpaqueToken,
  hashSecret,
  sha256Base64Url,
  verifySecretHash,
} from "@/src/server/infrastructure/crypto/secure-tokens"

type Transaction = Prisma.TransactionClient

const telegramChallengePayloadSchema = z.object({
  kind: z.literal("TELEGRAM_OIDC"),
  codeVerifier: z.string().min(43),
  nonce: z.string().min(32),
  intent: z.enum(["login", "link"]),
  targetUserId: z.string().nullable(),
  browserBindingHash: z.string().min(32),
})

type TelegramChallengePayload = z.infer<typeof telegramChallengePayloadSchema>

type TelegramCompletion =
  | {
      kind: "login"
      session: { token: string; expiresAt: Date; userId: string }
    }
  | { kind: "linked"; userId: string }

type CompletionResult =
  | { ok: true; completion: TelegramCompletion }
  | { ok: false; code: AppErrorCode }

export interface TelegramOidcGateway {
  createAuthorizationUrl(input: {
    state: string
    nonce: string
    codeChallenge: string
  }): URL
  exchangeAndVerify(input: {
    code: string
    codeVerifier: string
    nonce: string
  }): Promise<{
    subject: string
    username: string | null
    displayName: string | null
  }>
}

export class TelegramAuthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly oidc: TelegramOidcGateway,
    private readonly config: {
      tokenSecret: string
      encryptionKey: string
      sessionTtlDays: number
      challengeTtlSeconds: number
    }
  ) {}

  async begin(
    intent: "link" | "login",
    targetUserId: string | undefined,
    context: RequestContext
  ): Promise<{
    authorizationUrl: URL
    browserBindingToken: string
    expiresAt: Date
  }> {
    if (intent === "link" && !targetUserId) {
      throw new AppError("UNAUTHENTICATED")
    }

    const now = new Date()
    const challengeId = randomUUID()
    const stateToken = generateOpaqueToken()
    const nonce = generateOpaqueToken()
    const codeVerifier = generateOpaqueToken()
    const browserBindingToken = generateOpaqueToken()
    const state = `${challengeId}.${stateToken}`
    const expiresAt = new Date(
      now.getTime() + this.config.challengeTtlSeconds * 1000
    )
    const payload: TelegramChallengePayload = {
      kind: "TELEGRAM_OIDC",
      codeVerifier,
      nonce,
      intent,
      targetUserId: targetUserId ?? null,
      browserBindingHash: hashSecret(
        "magic",
        browserBindingToken,
        this.config.tokenSecret,
        challengeId
      ),
    }

    await this.db.$transaction(async (tx) => {
      await tx.loginChallenge.create({
        data: {
          id: challengeId,
          provider: AUTH_PROVIDER.TELEGRAM,
          purpose:
            intent === "link"
              ? CHALLENGE_PURPOSE.LINK_IDENTITY
              : CHALLENGE_PURPOSE.LOGIN,
          subject: `pending:${challengeId}`,
          oidcStateHash: hashSecret(
            "magic",
            stateToken,
            this.config.tokenSecret,
            challengeId
          ),
          encryptedPayload: encryptJson(payload, this.config.encryptionKey),
          expiresAt,
          maxAttempts: 1,
          requestIpHash: this.contextHash(context.ipAddress),
          userAgentHash: this.contextHash(context.userAgent),
        },
      })
      await tx.auditLog.create({
        data: {
          correlationId: context.correlationId,
          actorUserId: targetUserId,
          action: `auth.telegram.${intent}.start`,
          targetType: "LoginChallenge",
          targetId: challengeId,
          outcome: "SUCCESS",
          ipHash: this.contextHash(context.ipAddress),
        },
      })
    })

    return {
      authorizationUrl: this.oidc.createAuthorizationUrl({
        state,
        nonce,
        codeChallenge: sha256Base64Url(codeVerifier),
      }),
      browserBindingToken,
      expiresAt,
    }
  }

  async complete(
    code: string,
    state: string,
    browserBindingToken: string | undefined,
    currentUserId: string | undefined,
    context: RequestContext
  ): Promise<TelegramCompletion> {
    if (!code || !state) throw new AppError("TELEGRAM_AUTH_FAILED")
    const separator = state.indexOf(".")
    if (separator <= 0) throw new AppError("TELEGRAM_AUTH_FAILED")
    const challengeId = state.slice(0, separator)
    const stateToken = state.slice(separator + 1)
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || stateToken.length < 32) {
      throw new AppError("TELEGRAM_AUTH_FAILED")
    }

    const now = new Date()
    const challenge = await this.db.loginChallenge.findUnique({
      where: { id: challengeId },
    })
    if (
      !challenge ||
      challenge.provider !== AUTH_PROVIDER.TELEGRAM ||
      !challenge.oidcStateHash ||
      !challenge.encryptedPayload ||
      !verifySecretHash(
        challenge.oidcStateHash,
        hashSecret("magic", stateToken, this.config.tokenSecret, challengeId)
      )
    ) {
      throw new AppError("TELEGRAM_AUTH_FAILED")
    }
    if (challenge.consumedAt || challenge.supersededAt) {
      throw new AppError("CHALLENGE_USED")
    }
    if (challenge.expiresAt <= now) throw new AppError("CHALLENGE_EXPIRED")

    const payload = telegramChallengePayloadSchema.parse(
      decryptJson(challenge.encryptedPayload, this.config.encryptionKey)
    )
    if (
      !browserBindingToken ||
      !verifySecretHash(
        payload.browserBindingHash,
        hashSecret(
          "magic",
          browserBindingToken,
          this.config.tokenSecret,
          challengeId
        )
      )
    ) {
      throw new AppError("TELEGRAM_AUTH_FAILED")
    }
    if (
      payload.intent === "link" &&
      (!currentUserId || currentUserId !== payload.targetUserId)
    ) {
      throw new AppError("UNAUTHENTICATED")
    }

    const claims = await this.oidc.exchangeAndVerify({
      code,
      codeVerifier: payload.codeVerifier,
      nonce: payload.nonce,
    })

    const result = await this.db.$transaction((tx) =>
      this.completeTransaction(
        tx,
        challengeId,
        claims.subject,
        payload,
        context,
        now
      )
    )
    if (!result.ok) throw new AppError(result.code)
    return result.completion
  }

  private async completeTransaction(
    tx: Transaction,
    challengeId: string,
    subject: string,
    payload: TelegramChallengePayload,
    context: RequestContext,
    now: Date
  ): Promise<CompletionResult> {
    const consumed = await tx.loginChallenge.updateMany({
      where: {
        id: challengeId,
        consumedAt: null,
        supersededAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now, subject, encryptedPayload: null },
    })
    if (consumed.count !== 1) return { ok: false, code: "CHALLENGE_USED" }

    const existingIdentity = await tx.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: AUTH_PROVIDER.TELEGRAM,
          providerSubject: subject,
        },
      },
      include: { user: { select: { disabledAt: true } } },
    })

    if (payload.intent === "link") {
      const targetUserId = payload.targetUserId
      if (!targetUserId) return { ok: false, code: "UNAUTHENTICATED" }
      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { disabledAt: true },
      })
      if (!targetUser || targetUser.disabledAt) {
        return { ok: false, code: "UNAUTHENTICATED" }
      }
      if (existingIdentity && existingIdentity.userId !== targetUserId) {
        await this.auditDenied(
          tx,
          context,
          challengeId,
          "IDENTITY_ALREADY_LINKED",
          targetUserId
        )
        return { ok: false, code: "IDENTITY_ALREADY_LINKED" }
      }
      if (!existingIdentity) {
        await tx.authIdentity.create({
          data: {
            userId: targetUserId,
            provider: AUTH_PROVIDER.TELEGRAM,
            providerSubject: subject,
            verifiedAt: now,
          },
        })
      }
      await tx.auditLog.create({
        data: {
          correlationId: context.correlationId,
          actorUserId: targetUserId,
          action: "auth.identity.link",
          targetType: "AuthIdentity",
          targetId: subject,
          outcome: "SUCCESS",
          ipHash: this.contextHash(context.ipAddress),
          metadataJson: JSON.stringify({ provider: AUTH_PROVIDER.TELEGRAM }),
        },
      })
      return {
        ok: true,
        completion: { kind: "linked", userId: targetUserId },
      }
    }

    if (existingIdentity?.user.disabledAt) {
      return { ok: false, code: "UNAUTHENTICATED" }
    }
    let userId = existingIdentity?.userId
    if (!userId) {
      const user = await tx.user.create({ data: {} })
      userId = user.id
      await tx.authIdentity.create({
        data: {
          userId,
          provider: AUTH_PROVIDER.TELEGRAM,
          providerSubject: subject,
          verifiedAt: now,
        },
      })
    }

    const token = generateOpaqueToken()
    const expiresAt = new Date(
      now.getTime() + this.config.sessionTtlDays * 24 * 60 * 60 * 1000
    )
    const session = await tx.session.create({
      data: {
        userId,
        tokenHash: hashSecret("session", token, this.config.tokenSecret),
        expiresAt,
        ipHash: this.contextHash(context.ipAddress),
        userAgentHash: this.contextHash(context.userAgent),
      },
    })
    await tx.auditLog.create({
      data: {
        correlationId: context.correlationId,
        actorUserId: userId,
        action: "auth.session.create",
        targetType: "Session",
        targetId: session.id,
        outcome: "SUCCESS",
        ipHash: this.contextHash(context.ipAddress),
        metadataJson: JSON.stringify({
          method: "oidc",
          provider: AUTH_PROVIDER.TELEGRAM,
        }),
      },
    })
    return {
      ok: true,
      completion: {
        kind: "login",
        session: { token, expiresAt, userId },
      },
    }
  }

  private async auditDenied(
    tx: Transaction,
    context: RequestContext,
    challengeId: string,
    reason: AppErrorCode,
    actorUserId?: string
  ) {
    await tx.auditLog.create({
      data: {
        correlationId: context.correlationId,
        actorUserId,
        action: "auth.identity.link",
        targetType: "LoginChallenge",
        targetId: challengeId,
        outcome: "DENIED",
        ipHash: this.contextHash(context.ipAddress),
        metadataJson: JSON.stringify({ reason }),
      },
    })
  }

  private contextHash(value: string | undefined): string | undefined {
    return value
      ? hashSecret(
          "request-context",
          value.slice(0, 1024),
          this.config.tokenSecret
        )
      : undefined
  }
}
