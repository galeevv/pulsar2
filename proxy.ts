import { NextRequest, NextResponse } from "next/server"

import {
  CORRELATION_HEADER,
  correlationId,
} from "@/src/server/infrastructure/observability/correlation"

const protectedRoutes = [
  "/home",
  "/subscription",
  "/referrals",
  "/profile",
  "/support",
  "/legal",
]

export function proxy(request: NextRequest) {
  const id = correlationId(request.headers.get(CORRELATION_HEADER))
  const cookieName = process.env.SESSION_COOKIE_NAME ?? "pulsar_session"
  const isProtected = protectedRoutes.some(
    (route) =>
      request.nextUrl.pathname === route ||
      request.nextUrl.pathname.startsWith(`${route}/`)
  )

  if (isProtected && !request.cookies.get(cookieName)?.value) {
    const response = NextResponse.redirect(new URL("/", request.url))
    response.headers.set(CORRELATION_HEADER, id)
    return response
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(CORRELATION_HEADER, id)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(CORRELATION_HEADER, id)
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
