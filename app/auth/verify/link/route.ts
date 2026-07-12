import { NextRequest, NextResponse } from "next/server"

import { getAuthService } from "@/src/server/application/auth/service-factory"
import { asAppError } from "@/src/server/domain/errors"
import {
  CORRELATION_HEADER,
  correlationId,
} from "@/src/server/infrastructure/observability/correlation"
import { logger } from "@/src/server/infrastructure/observability/logger"
import { setSessionCookie } from "@/src/server/transport/next/session-cookie"

export async function GET(request: NextRequest) {
  const context = {
    correlationId: correlationId(request.headers.get(CORRELATION_HEADER)),
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined,
    userAgent: request.headers.get("user-agent")?.slice(0, 1024),
  }
  try {
    const session = await (
      await getAuthService()
    ).verifyMagicLink(
      request.nextUrl.searchParams.get("challenge") ?? "",
      request.nextUrl.searchParams.get("token") ?? "",
      context
    )
    await setSessionCookie(session)
    return NextResponse.redirect(new URL("/home", request.url))
  } catch (error) {
    const appError = asAppError(error)
    logger.warn("auth.magic_link_failed", {
      correlationId: context.correlationId,
      code: appError.code,
    })
    const state =
      appError.code === "CHALLENGE_USED" ||
      appError.code === "CHALLENGE_ATTEMPTS_EXHAUSTED"
        ? "used"
        : "expired"
    return NextResponse.redirect(
      new URL(`/auth/verify?error=${state}`, request.url)
    )
  }
}
