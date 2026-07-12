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
  encryptJson,
  generateOpaqueToken,
  generateOtp,
  hashSecret,
  verifySecretHash,
} from "@/src/server/infrastructure/crypto/secure-tokens"

const emailSchema = z
  .email()
  .max(254)
  .transform((email) => email.toLowerCase())

type Transaction = Prisma.TransactionClient

interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

export interface AuthServiceConfig {
  appUrl: URL
  tokenSecret: string
  outboxEncryptionKey: string
  otpTtlSeconds: number
  magicLinkTtlSeconds: number
  sessionTtlDays: number
  maxAttempts: number
  emailRateLimit: number
  ipRateLimit: number
  rateLimitWindowSeconds: number
  resendCooldownSeconds: number
}

export interface CreatedSession {
  token: string
  expiresAt: Date
  userId: string
}

export interface AuthenticatedSession {
  id: string
  userId: string
  expiresAt: Date
  email: string | null
  telegramId: string | null
}

interface EmailLoginPayload {
  kind: "AUTH_LOGIN_EMAIL"
  to: string
  otp: string
  magicUrl: string
  expiresInMinutes: number
  expiresAt: string
}

type CompletionResult =
  { ok: true; session: CreatedSession } | { ok: false; code: AppErrorCode }

export class AuthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly config: AuthServiceConfig
  ) {}

  async requestEmailLogin(
    rawEmail: string,
    context: RequestContext
  ): Promise<{ email: string; expiresAt: Date }> {
    const parsed = emailSchema.safeParse(rawEmail.trim())
    if (!parsed.success) throw new AppError("VALIDATION_ERROR")

    const email = parsed.data
    const now = new Date()
    const challengeId = randomUUID()
    const otp = generateOtp()
    const magicToken = generateOpaqueToken()
    const expiresAt = new Date(
      now.getTime() +
        Math.min(this.config.otpTtlSeconds, this.config.magicLinkTtlSeconds) *
          1000
    )
    const ipHash = this.contextHash("request-context", context.ipAddress)
    const userAgentHash = this.contextHash("request-context", context.userAgent)
    const magicUrl = new URL("/auth/verify/link", this.config.appUrl)
    magicUrl.searchParams.set("challenge", challengeId)
    magicUrl.searchParams.set("token", magicToken)

    const payload: EmailLoginPayload = {
      kind: "AUTH_LOGIN_EMAIL",
      to: email,
      otp,
      magicUrl: magicUrl.toString(),
      expiresInMinutes: Math.ceil(
        Math.min(this.config.otpTtlSeconds, this.config.magicLinkTtlSeconds) /
          60
      ),
      expiresAt: expiresAt.toISOString(),
    }

    const result = await this.db.$transaction(async (tx) => {
      const cooldownDecision =
        this.config.resendCooldownSeconds <= 0
          ? { allowed: true, retryAfterSeconds: 0 }
          : await this.consumeRateLimit(
              tx,
              `email-cooldown:${email}`,
              1,
              now,
              this.config.resendCooldownSeconds
            )
      if (!cooldownDecision.allowed) {
        await tx.auditLog.create({
          data: {
            correlationId: context.correlationId,
            action: "auth.email_challenge.request",
            outcome: "DENIED",
            ipHash,
            metadataJson: JSON.stringify({ reason: "resend_cooldown" }),
          },
        })
        return {
          ok: false,
          retryAfterSeconds: cooldownDecision.retryAfterSeconds,
        }
      }
      const emailDecision = await this.consumeRateLimit(
        tx,
        `email:${email}`,
        this.config.emailRateLimit,
        now
      )
      const ipDecision = context.ipAddress
        ? await this.consumeRateLimit(
            tx,
            `ip:${context.ipAddress}`,
            this.config.ipRateLimit,
            now
          )
        : { allowed: true, retryAfterSeconds: 0 }

      if (!emailDecision.allowed || !ipDecision.allowed) {
        await tx.auditLog.create({
          data: {
            correlationId: context.correlationId,
            action: "auth.email_challenge.request",
            outcome: "DENIED",
            ipHash,
            metadataJson: JSON.stringify({ reason: "rate_limited" }),
          },
        })
        return {
          ok: false,
          retryAfterSeconds: Math.max(
            emailDecision.retryAfterSeconds,
            ipDecision.retryAfterSeconds
          ),
        }
      }

      await tx.loginChallenge.updateMany({
        where: {
          provider: AUTH_PROVIDER.EMAIL,
          subject: email,
          consumedAt: null,
          supersededAt: null,
          expiresAt: { gt: now },
        },
        data: { supersededAt: now },
      })

      await tx.loginChallenge.create({
        data: {
          id: challengeId,
          provider: AUTH_PROVIDER.EMAIL,
          purpose: CHALLENGE_PURPOSE.LOGIN,
          subject: email,
          otpHash: hashSecret("otp", otp, this.config.tokenSecret, challengeId),
          magicTokenHash: hashSecret(
            "magic",
            magicToken,
            this.config.tokenSecret,
            challengeId
          ),
          expiresAt,
          maxAttempts: this.config.maxAttempts,
          requestIpHash: ipHash,
          userAgentHash,
        },
      })

      await tx.outboxEvent.create({
        data: {
          type: payload.kind,
          encryptedPayload: encryptJson(
            payload,
            this.config.outboxEncryptionKey
          ),
          deduplicationKey: `auth-login-email/${challengeId}`,
          correlationId: context.correlationId,
        },
      })

      await tx.auditLog.create({
        data: {
          correlationId: context.correlationId,
          action: "auth.email_challenge.request",
          targetType: "LoginChallenge",
          targetId: challengeId,
          outcome: "SUCCESS",
          ipHash,
        },
      })
      return { ok: true } as const
    })

    if (!result.ok) {
      throw new AppError("RATE_LIMITED", {
        retryAfterSeconds: result.retryAfterSeconds,
      })
    }
    return { email, expiresAt }
  }

  async verifyEmailOtp(
    rawEmail: string,
    rawOtp: string,
    context: RequestContext
  ): Promise<CreatedSession> {
    const emailResult = emailSchema.safeParse(rawEmail.trim())
    if (!emailResult.success || !/^\d{6}$/.test(rawOtp)) {
      throw new AppError("VALIDATION_ERROR")
    }

    const email = emailResult.data
    const now = new Date()
    const result = await this.db.$transaction(async (tx) => {
      const challenge = await tx.loginChallenge.findFirst({
        where: { provider: AUTH_PROVIDER.EMAIL, subject: email },
        orderBy: { createdAt: "desc" },
      })
      if (!challenge) {
        await this.recordDenied(
          tx,
          context,
          "auth.email_challenge.verify_otp",
          "CHALLENGE_INVALID"
        )
        return { ok: false, code: "CHALLENGE_INVALID" } as const
      }
      const stateError = this.challengeStateError(challenge, now)
      if (stateError) {
        await this.recordDenied(
          tx,
          context,
          "auth.email_challenge.verify_otp",
          stateError,
          challenge.id
        )
        return { ok: false, code: stateError } as const
      }

      const actualHash = hashSecret(
        "otp",
        rawOtp,
        this.config.tokenSecret,
        challenge.id
      )
      if (
        !challenge.otpHash ||
        !verifySecretHash(challenge.otpHash, actualHash)
      ) {
        await tx.loginChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            supersededAt: null,
            attempts: { lt: challenge.maxAttempts },
          },
          data: { attempts: { increment: 1 } },
        })
        const updated = await tx.loginChallenge.findUniqueOrThrow({
          where: { id: challenge.id },
          select: { attempts: true, maxAttempts: true },
        })
        const code =
          updated.attempts >= updated.maxAttempts
            ? "CHALLENGE_ATTEMPTS_EXHAUSTED"
            : "CHALLENGE_INVALID"
        await this.recordDenied(
          tx,
          context,
          "auth.email_challenge.verify_otp",
          code,
          challenge.id
        )
        return {
          ok: false,
          code,
        } as const
      }

      return this.completeChallenge(tx, challenge, context, now, "otp")
    })

    return this.unwrapCompletion(result)
  }

  async verifyMagicLink(
    challengeId: string,
    token: string,
    context: RequestContext
  ): Promise<CreatedSession> {
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || token.length < 32) {
      throw new AppError("CHALLENGE_INVALID")
    }

    const now = new Date()
    const tokenHash = hashSecret(
      "magic",
      token,
      this.config.tokenSecret,
      challengeId
    )
    const result = await this.db.$transaction(async (tx) => {
      const challenge = await tx.loginChallenge.findUnique({
        where: { id: challengeId },
      })
      if (
        !challenge ||
        !challenge.magicTokenHash ||
        !verifySecretHash(challenge.magicTokenHash, tokenHash)
      ) {
        await this.recordDenied(
          tx,
          context,
          "auth.email_challenge.verify_magic_link",
          "CHALLENGE_INVALID"
        )
        return { ok: false, code: "CHALLENGE_INVALID" } as const
      }
      const stateError = this.challengeStateError(challenge, now)
      if (stateError) {
        await this.recordDenied(
          tx,
          context,
          "auth.email_challenge.verify_magic_link",
          stateError,
          challenge.id
        )
        return { ok: false, code: stateError } as const
      }
      return this.completeChallenge(tx, challenge, context, now, "magic_link")
    })

    return this.unwrapCompletion(result)
  }

  async authenticateSession(
    token: string | undefined
  ): Promise<AuthenticatedSession> {
    if (!token) throw new AppError("UNAUTHENTICATED")
    const tokenHash = hashSecret("session", token, this.config.tokenSecret)
    const now = new Date()
    const session = await this.db.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            email: true,
            disabledAt: true,
            identities: {
              where: { provider: AUTH_PROVIDER.TELEGRAM },
              select: { providerSubject: true },
              take: 1,
            },
          },
        },
      },
    })
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.disabledAt
    ) {
      throw new AppError("UNAUTHENTICATED")
    }

    return {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      email: session.user.email,
      telegramId: session.user.identities[0]?.providerSubject ?? null,
    }
  }

  async logoutCurrentSession(
    token: string | undefined,
    context: RequestContext
  ): Promise<void> {
    if (!token) return
    const tokenHash = hashSecret("session", token, this.config.tokenSecret)
    const session = await this.db.session.findUnique({ where: { tokenHash } })
    if (!session || session.revokedAt) return
    const now = new Date()
    await this.db.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      })
      if (revoked.count === 1) {
        await tx.auditLog.create({
          data: {
            correlationId: context.correlationId,
            actorUserId: session.userId,
            action: "auth.session.logout",
            targetType: "Session",
            targetId: session.id,
            outcome: "SUCCESS",
            ipHash: this.contextHash("request-context", context.ipAddress),
          },
        })
      }
    })
  }

  private async completeChallenge(
    tx: Transaction,
    challenge: {
      id: string
      provider: string
      subject: string
      consumedAt: Date | null
      supersededAt: Date | null
      expiresAt: Date
      attempts: number
      maxAttempts: number
    },
    context: RequestContext,
    now: Date,
    method: "otp" | "magic_link"
  ): Promise<CompletionResult> {
    const consumed = await tx.loginChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        supersededAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    })
    if (consumed.count !== 1) {
      await this.recordDenied(
        tx,
        context,
        `auth.email_challenge.verify_${method}`,
        "CHALLENGE_USED",
        challenge.id
      )
      return { ok: false, code: "CHALLENGE_USED" }
    }

    let identity = await tx.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: challenge.provider,
          providerSubject: challenge.subject,
        },
      },
    })
    if (!identity) {
      const user = await tx.user.create({
        data: {
          email:
            challenge.provider === AUTH_PROVIDER.EMAIL
              ? challenge.subject
              : null,
        },
      })
      identity = await tx.authIdentity.create({
        data: {
          userId: user.id,
          provider: challenge.provider,
          providerSubject: challenge.subject,
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
        userId: identity.userId,
        tokenHash: hashSecret("session", token, this.config.tokenSecret),
        expiresAt,
        ipHash: this.contextHash("request-context", context.ipAddress),
        userAgentHash: this.contextHash("request-context", context.userAgent),
      },
    })
    await tx.auditLog.create({
      data: {
        correlationId: context.correlationId,
        actorUserId: identity.userId,
        action: "auth.session.create",
        targetType: "Session",
        targetId: session.id,
        outcome: "SUCCESS",
        ipHash: this.contextHash("request-context", context.ipAddress),
        metadataJson: JSON.stringify({ method, provider: challenge.provider }),
      },
    })
    return { ok: true, session: { token, expiresAt, userId: identity.userId } }
  }

  private unwrapCompletion(result: CompletionResult): CreatedSession {
    if (result.ok) return result.session
    throw new AppError(result.code)
  }

  private challengeStateError(
    challenge: {
      attempts: number
      consumedAt: Date | null
      expiresAt: Date
      maxAttempts: number
      supersededAt: Date | null
    },
    now: Date
  ): AppErrorCode | null {
    if (challenge.consumedAt || challenge.supersededAt) return "CHALLENGE_USED"
    if (challenge.expiresAt <= now) return "CHALLENGE_EXPIRED"
    if (challenge.attempts >= challenge.maxAttempts) {
      return "CHALLENGE_ATTEMPTS_EXHAUSTED"
    }
    return null
  }

  private async consumeRateLimit(
    tx: Transaction,
    rawKey: string,
    limit: number,
    now: Date,
    windowSeconds = this.config.rateLimitWindowSeconds
  ): Promise<RateLimitDecision> {
    const keyHash = hashSecret("rate-limit", rawKey, this.config.tokenSecret)
    const existing = await tx.rateLimitBucket.findUnique({ where: { keyHash } })
    const resetAt = new Date(now.getTime() + windowSeconds * 1000)
    if (!existing) {
      await tx.rateLimitBucket.create({ data: { keyHash, count: 1, resetAt } })
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (existing.resetAt <= now) {
      await tx.rateLimitBucket.update({
        where: { keyHash },
        data: { count: 1, resetAt },
      })
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (existing.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000)
        ),
      }
    }
    const incremented = await tx.rateLimitBucket.updateMany({
      where: { keyHash, count: { lt: limit }, resetAt: { gt: now } },
      data: { count: { increment: 1 } },
    })
    if (incremented.count === 1) {
      return { allowed: true, retryAfterSeconds: 0 }
    }

    const current = await tx.rateLimitBucket.findUnique({ where: { keyHash } })
    return {
      allowed: false,
      retryAfterSeconds: current
        ? Math.max(
            1,
            Math.ceil((current.resetAt.getTime() - now.getTime()) / 1000)
          )
        : windowSeconds,
    }
  }

  private async recordDenied(
    tx: Transaction,
    context: RequestContext,
    action: string,
    reason: AppErrorCode,
    challengeId?: string
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        correlationId: context.correlationId,
        action,
        targetType: challengeId ? "LoginChallenge" : undefined,
        targetId: challengeId,
        outcome: "DENIED",
        ipHash: this.contextHash("request-context", context.ipAddress),
        metadataJson: JSON.stringify({ reason }),
      },
    })
  }

  private contextHash(
    kind: "request-context",
    value: string | undefined
  ): string | undefined {
    return value
      ? hashSecret(kind, value.slice(0, 1024), this.config.tokenSecret)
      : undefined
  }
}
