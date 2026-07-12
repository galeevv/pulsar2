import { TelegramAuthService } from "@/src/server/application/auth/telegram-auth-service"
import {
  getServerEnv,
  getTelegramOidcConfig,
} from "@/src/server/infrastructure/config/env"
import {
  ensureDatabaseReady,
  prisma,
} from "@/src/server/infrastructure/database/prisma"
import { TelegramOidcClient } from "@/src/server/infrastructure/telegram/telegram-oidc-client"

let service: TelegramAuthService | undefined

export async function getTelegramAuthService(): Promise<TelegramAuthService> {
  await ensureDatabaseReady()
  if (service) return service
  const env = getServerEnv()
  service = new TelegramAuthService(
    prisma,
    new TelegramOidcClient(getTelegramOidcConfig()),
    {
      tokenSecret: env.AUTH_TOKEN_SECRET,
      encryptionKey: env.OUTBOX_ENCRYPTION_KEY,
      sessionTtlDays: env.AUTH_SESSION_TTL_DAYS,
      challengeTtlSeconds: 600,
    }
  )
  return service
}
