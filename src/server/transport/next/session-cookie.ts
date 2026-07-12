import { cookies } from "next/headers"

import type { CreatedSession } from "@/src/server/application/auth/auth-service"
import { getServerEnv } from "@/src/server/infrastructure/config/env"

export async function readSessionToken(): Promise<string | undefined> {
  const env = getServerEnv()
  return (await cookies()).get(env.SESSION_COOKIE_NAME)?.value
}

export async function setSessionCookie(session: CreatedSession): Promise<void> {
  const env = getServerEnv()
  const maxAge = Math.max(
    0,
    Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
  )
  ;(await cookies()).set(env.SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: env.production,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
    maxAge,
    priority: "high",
  })
}

export async function clearSessionCookie(): Promise<void> {
  const env = getServerEnv()
  ;(await cookies()).set(env.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: env.production,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
    priority: "high",
  })
}
