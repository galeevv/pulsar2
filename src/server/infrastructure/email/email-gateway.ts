export interface LoginEmailMessage {
  kind: "AUTH_LOGIN_EMAIL"
  to: string
  otp: string
  magicUrl: string
  expiresInMinutes: number
  expiresAt: string
}

export interface EmailGateway {
  sendLoginEmail(
    message: LoginEmailMessage,
    idempotencyKey: string
  ): Promise<string>
}
