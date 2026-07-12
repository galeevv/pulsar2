export const AUTH_PROVIDER = {
  EMAIL: "EMAIL",
  TELEGRAM: "TELEGRAM",
} as const

export type AuthProvider = (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER]

export const CHALLENGE_PURPOSE = {
  LOGIN: "LOGIN",
  LINK_IDENTITY: "LINK_IDENTITY",
} as const

export type ChallengePurpose =
  (typeof CHALLENGE_PURPOSE)[keyof typeof CHALLENGE_PURPOSE]

export interface RequestContext {
  correlationId: string
  ipAddress?: string
  userAgent?: string
}

// Telegram will enter through this same verified-subject lifecycle once its
// signed Login Widget payload/webhook transport is implemented.
export interface VerifiedIdentity {
  provider: AuthProvider
  providerSubject: string
}
