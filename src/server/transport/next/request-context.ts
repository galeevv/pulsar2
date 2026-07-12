import { headers } from "next/headers"

import type { RequestContext } from "@/src/server/domain/auth"
import {
  CORRELATION_HEADER,
  correlationId,
} from "@/src/server/infrastructure/observability/correlation"

export async function getRequestContext(): Promise<RequestContext> {
  const requestHeaders = await headers()
  const forwardedFor = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim()
  return {
    correlationId: correlationId(requestHeaders.get(CORRELATION_HEADER)),
    ipAddress: forwardedFor ?? requestHeaders.get("x-real-ip") ?? undefined,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 1024),
  }
}
