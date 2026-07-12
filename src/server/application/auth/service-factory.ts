import { AuthService } from "@/src/server/application/auth/auth-service"
import { getServerEnv } from "@/src/server/infrastructure/config/env"
import {
  ensureDatabaseReady,
  prisma,
} from "@/src/server/infrastructure/database/prisma"

let authService: AuthService | undefined

export async function getAuthService(): Promise<AuthService> {
  await ensureDatabaseReady()
  if (authService) return authService
  const env = getServerEnv()
  authService = new AuthService(prisma, {
    appUrl: env.appUrl,
    tokenSecret: env.AUTH_TOKEN_SECRET,
    outboxEncryptionKey: env.OUTBOX_ENCRYPTION_KEY,
    otpTtlSeconds: env.AUTH_OTP_TTL_SECONDS,
    magicLinkTtlSeconds: env.AUTH_MAGIC_LINK_TTL_SECONDS,
    sessionTtlDays: env.AUTH_SESSION_TTL_DAYS,
    maxAttempts: env.AUTH_MAX_ATTEMPTS,
    emailRateLimit: env.AUTH_EMAIL_RATE_LIMIT,
    ipRateLimit: env.AUTH_IP_RATE_LIMIT,
    rateLimitWindowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    resendCooldownSeconds: env.AUTH_RESEND_COOLDOWN_SECONDS,
  })
  return authService
}
