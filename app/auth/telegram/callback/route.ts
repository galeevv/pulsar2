import { NextRequest, NextResponse } from "next/server"

import { getAuthService } from "@/src/server/application/auth/service-factory"
import { getTelegramAuthService } from "@/src/server/application/auth/telegram-service-factory"
import { asAppError } from "@/src/server/domain/errors"
import { logger } from "@/src/server/infrastructure/observability/logger"
import { getRequestContext } from "@/src/server/transport/next/request-context"
import {
  readSessionToken,
  setSessionCookie,
} from "@/src/server/transport/next/session-cookie"

export async function GET(request: NextRequest) {
  const context = await getRequestContext()
  try {
    if (request.nextUrl.searchParams.has("error")) {
      throw new Error("Telegram authorization cancelled")
    }
    const token = await readSessionToken()
    let currentUserId: string | undefined
    if (token) {
      try {
        currentUserId = (
          await (await getAuthService()).authenticateSession(token)
        ).userId
      } catch {
        currentUserId = undefined
      }
    }
    const completion = await (
      await getTelegramAuthService()
    ).complete(
      request.nextUrl.searchParams.get("code") ?? "",
      request.nextUrl.searchParams.get("state") ?? "",
      request.cookies.get("pulsar_telegram_oidc")?.value,
      currentUserId,
      context
    )
    if (completion.kind === "login") {
      await setSessionCookie(completion.session)
      return redirectAndClearBinding("/home", request)
    }
    return redirectAndClearBinding("/profile?telegram=linked", request)
  } catch (error) {
    const appError = asAppError(error)
    logger.warn("auth.telegram.callback_failed", {
      correlationId: context.correlationId,
      code: appError.code,
    })
    const destination =
      appError.code === "IDENTITY_ALREADY_LINKED"
        ? "/profile?telegram=already-linked"
        : currentPathForError(request)
    return redirectAndClearBinding(destination, request)
  }
}

function redirectAndClearBinding(path: string, request: NextRequest) {
  const response = NextResponse.redirect(new URL(path, request.url))
  response.cookies.set("pulsar_telegram_oidc", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/telegram",
    expires: new Date(0),
    maxAge: 0,
    priority: "high",
  })
  return response
}

function currentPathForError(request: NextRequest): string {
  return request.cookies.get(
    process.env.SESSION_COOKIE_NAME ?? "pulsar_session"
  )?.value
    ? "/profile?telegram=error"
    : "/?authError=telegram"
}
