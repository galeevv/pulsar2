import { createRemoteJWKSet, jwtVerify } from "jose"
import { z } from "zod"

import { AppError } from "@/src/server/domain/errors"

const issuer = "https://oauth.telegram.org"
const authorizationEndpoint = `${issuer}/auth`
const tokenEndpoint = `${issuer}/token`
const telegramJwks = createRemoteJWKSet(
  new URL(`${issuer}/.well-known/jwks.json`)
)

const tokenResponseSchema = z.object({
  id_token: z.string().min(20),
})

export interface TelegramIdentityClaims {
  subject: string
  username: string | null
  displayName: string | null
}

export class TelegramOidcClient {
  constructor(
    private readonly config: {
      clientId: string
      clientSecret: string
      redirectUri: string
    }
  ) {}

  createAuthorizationUrl(input: {
    state: string
    nonce: string
    codeChallenge: string
  }): URL {
    const url = new URL(authorizationEndpoint)
    url.searchParams.set("client_id", this.config.clientId)
    url.searchParams.set("redirect_uri", this.config.redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", "openid profile")
    url.searchParams.set("state", input.state)
    url.searchParams.set("nonce", input.nonce)
    url.searchParams.set("code_challenge", input.codeChallenge)
    url.searchParams.set("code_challenge_method", "S256")
    return url
  }

  async exchangeAndVerify(input: {
    code: string
    codeVerifier: string
    nonce: string
  }): Promise<TelegramIdentityClaims> {
    let response: Response
    try {
      response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(
            `${this.config.clientId}:${this.config.clientSecret}`
          ).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: input.code,
          redirect_uri: this.config.redirectUri,
          client_id: this.config.clientId,
          code_verifier: input.codeVerifier,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      throw new AppError("PROVIDER_UNAVAILABLE", {
        cause: error,
        message: "Telegram token endpoint unavailable",
        retryable: true,
      })
    }

    const raw: unknown = await response.json().catch(() => null)
    const parsed = tokenResponseSchema.safeParse(raw)
    if (!response.ok || !parsed.success) {
      throw new AppError("TELEGRAM_AUTH_FAILED", {
        message: "Telegram rejected authorization code",
      })
    }

    try {
      const { payload, protectedHeader } = await jwtVerify(
        parsed.data.id_token,
        telegramJwks,
        {
          issuer,
          audience: this.config.clientId,
          algorithms: ["RS256"],
        }
      )
      if (
        protectedHeader.alg !== "RS256" ||
        payload.nonce !== input.nonce ||
        typeof payload.sub !== "string" ||
        payload.sub.length === 0
      ) {
        throw new Error("Invalid Telegram ID token claims")
      }
      return {
        subject: payload.sub,
        username:
          typeof payload.preferred_username === "string"
            ? payload.preferred_username
            : null,
        displayName: typeof payload.name === "string" ? payload.name : null,
      }
    } catch (error) {
      throw new AppError("TELEGRAM_AUTH_FAILED", {
        cause: error,
        message: "Telegram ID token validation failed",
      })
    }
  }
}
