import "dotenv/config"

import { z } from "zod"

const positiveInteger = z.coerce.number().int().positive()
const optionalString = (schema: z.ZodString) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional())

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().min(1).default("file:./data/pulsar.db"),
    NEXT_PUBLIC_APP_URL: z.url(),
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .default("pulsar_session"),
    AUTH_TOKEN_SECRET: optionalString(z.string().min(32)),
    SESSION_SECRET: optionalString(z.string().min(32)),
    OUTBOX_ENCRYPTION_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().startsWith("re_").min(20),
    EMAIL_FROM: z
      .string()
      .regex(/^[^<>\r\n]*<?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/),
    AUTH_OTP_TTL_SECONDS: positiveInteger.default(600),
    AUTH_MAGIC_LINK_TTL_SECONDS: positiveInteger.default(600),
    AUTH_SESSION_TTL_DAYS: positiveInteger.default(180),
    AUTH_MAX_ATTEMPTS: positiveInteger.max(10).default(5),
    AUTH_EMAIL_RATE_LIMIT: positiveInteger.default(5),
    AUTH_IP_RATE_LIMIT: positiveInteger.default(20),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: positiveInteger.default(900),
    AUTH_RESEND_COOLDOWN_SECONDS: positiveInteger.default(60),
    OUTBOX_POLL_INTERVAL_MS: positiveInteger.default(2000),
    OUTBOX_BATCH_SIZE: positiveInteger.max(100).default(10),
    TELEGRAM_BOT_TOKEN: optionalString(z.string().min(20)),
    TELEGRAM_BOT_USERNAME: optionalString(
      z.string().regex(/^@?[A-Za-z0-9_]{5,32}$/)
    ),
    TELEGRAM_OIDC_CLIENT_ID: optionalString(z.string().regex(/^\d+$/)),
    TELEGRAM_OIDC_CLIENT_SECRET: optionalString(z.string().min(32)),
    TELEGRAM_OIDC_REDIRECT_URI: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional()
    ),
  })
  .superRefine((value, context) => {
    if (!value.AUTH_TOKEN_SECRET && !value.SESSION_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_TOKEN_SECRET"],
        message: "AUTH_TOKEN_SECRET or SESSION_SECRET is required",
      })
    }

    try {
      const key = Buffer.from(value.OUTBOX_ENCRYPTION_KEY, "base64")
      if (key.length !== 32) throw new Error("invalid length")
    } catch {
      context.addIssue({
        code: "custom",
        path: ["OUTBOX_ENCRYPTION_KEY"],
        message: "must be a base64-encoded 32-byte key",
      })
    }
  })
  .transform((value) => ({
    ...value,
    AUTH_TOKEN_SECRET: value.AUTH_TOKEN_SECRET ?? value.SESSION_SECRET!,
    appUrl: new URL(value.NEXT_PUBLIC_APP_URL),
    production: value.NODE_ENV === "production",
  }))

export type ServerEnv = z.infer<typeof envSchema>

let cachedEnv: ServerEnv | undefined

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv

  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join("."))
    throw new Error(`Invalid server environment: ${fields.join(", ")}`)
  }

  cachedEnv = parsed.data
  return cachedEnv
}

export function parseServerEnv(input: NodeJS.ProcessEnv): ServerEnv {
  return envSchema.parse(input)
}

export function getTelegramOidcConfig() {
  const env = getServerEnv()
  if (
    !env.TELEGRAM_OIDC_CLIENT_ID ||
    !env.TELEGRAM_OIDC_CLIENT_SECRET ||
    !env.TELEGRAM_OIDC_REDIRECT_URI
  ) {
    throw new Error("Telegram OIDC environment is not configured")
  }
  return {
    clientId: env.TELEGRAM_OIDC_CLIENT_ID,
    clientSecret: env.TELEGRAM_OIDC_CLIENT_SECRET,
    redirectUri: env.TELEGRAM_OIDC_REDIRECT_URI,
  }
}
