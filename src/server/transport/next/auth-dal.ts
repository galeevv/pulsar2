import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import { getAuthService } from "@/src/server/application/auth/service-factory"
import { AppError } from "@/src/server/domain/errors"
import { readSessionToken } from "@/src/server/transport/next/session-cookie"

export const getCurrentSession = cache(async () => {
  const token = await readSessionToken()
  try {
    return await (await getAuthService()).authenticateSession(token)
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED")
      return null
    throw error
  }
})

export async function requireSession() {
  const session = await getCurrentSession()
  if (!session) redirect("/")
  return session
}
