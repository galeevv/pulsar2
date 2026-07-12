import { NextRequest, NextResponse } from "next/server"

import { getAuthService } from "@/src/server/application/auth/service-factory"
import { getTelegramAuthService } from "@/src/server/application/auth/telegram-service-factory"
import { logger } from "@/src/server/infrastructure/observability/logger"
import { getRequestContext } from "@/src/server/transport/next/request-context"
import { readSessionToken } from "@/src/server/transport/next/session-cookie"

export async function GET(request: NextRequest) {
  const intent =
    request.nextUrl.searchParams.get("intent") === "link" ? "link" : "login"
  const context = await getRequestContext()
  try {
    let userId: string | undefined
    if (intent === "link") {
      const token = await readSessionToken()
      userId = (await (await getAuthService()).authenticateSession(token))
        .userId
    }
    const started = await (
      await getTelegramAuthService()
    ).begin(intent, userId, context)
    const response = NextResponse.redirect(started.authorizationUrl)
    response.cookies.set("pulsar_telegram_oidc", started.browserBindingToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/telegram",
      expires: started.expiresAt,
      priority: "high",
    })
    return response
  } catch {
    logger.warn("auth.telegram.start_failed", {
      correlationId: context.correlationId,
      intent,
    })
    const destination =
      intent === "link" ? "/profile?telegram=error" : "/?authError=telegram"
    return NextResponse.redirect(new URL(destination, request.url))
  }
}
