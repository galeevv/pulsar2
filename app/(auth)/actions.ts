"use server"

import { getAuthService } from "@/src/server/application/auth/service-factory"
import { asAppError } from "@/src/server/domain/errors"
import { logger } from "@/src/server/infrastructure/observability/logger"
import { getRequestContext } from "@/src/server/transport/next/request-context"
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "@/src/server/transport/next/session-cookie"

export interface AuthActionResult {
  status: "authenticated" | "error" | "idle" | "sent"
  message?: string
  email?: string
  code?: string
  retryAfterSeconds?: number
}

export async function requestEmailLoginAction(input: {
  email: string
  invite?: string
}): Promise<AuthActionResult> {
  const context = await getRequestContext()
  try {
    const result = await (
      await getAuthService()
    ).requestEmailLogin(input.email, context)
    return {
      status: "sent",
      email: result.email,
      message: "Код и ссылка для входа отправлены на email.",
    }
  } catch (error) {
    const appError = asAppError(error)
    logger.warn("auth.request_failed", {
      correlationId: context.correlationId,
      code: appError.code,
    })
    return {
      status: "error",
      code: appError.code,
      message:
        appError.code === "RATE_LIMITED" && appError.retryAfterSeconds
          ? `Слишком много попыток. Попробуйте через ${formatRetryAfter(appError.retryAfterSeconds)}.`
          : appError.publicMessage,
      retryAfterSeconds: appError.retryAfterSeconds,
    }
  }
}

function formatRetryAfter(totalSeconds: number): string {
  const safeSeconds = Math.max(1, Math.ceil(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export async function verifyEmailOtpAction(input: {
  email: string
  otp: string
  invite?: string
}): Promise<AuthActionResult> {
  const context = await getRequestContext()
  try {
    const session = await (
      await getAuthService()
    ).verifyEmailOtp(input.email, input.otp, context)
    await setSessionCookie(session)
    return { status: "authenticated" }
  } catch (error) {
    const appError = asAppError(error)
    logger.warn("auth.otp_failed", {
      correlationId: context.correlationId,
      code: appError.code,
    })
    return {
      status: "error",
      code: appError.code,
      message: appError.publicMessage,
    }
  }
}

export async function logoutAction(): Promise<void> {
  const [context, token] = await Promise.all([
    getRequestContext(),
    readSessionToken(),
  ])
  await (await getAuthService()).logoutCurrentSession(token, context)
  await clearSessionCookie()
}
