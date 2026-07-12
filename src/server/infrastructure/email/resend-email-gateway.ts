import { Resend } from "resend"

import { AppError } from "@/src/server/domain/errors"
import type {
  EmailGateway,
  LoginEmailMessage,
} from "@/src/server/infrastructure/email/email-gateway"
import { renderPulsarLoginEmail } from "@/src/server/infrastructure/email/pulsar-login-email"

export class ResendEmailGateway implements EmailGateway {
  private readonly resend: Resend

  constructor(
    apiKey: string,
    private readonly from: string
  ) {
    this.resend = new Resend(apiKey)
  }

  async sendLoginEmail(
    message: LoginEmailMessage,
    idempotencyKey: string
  ): Promise<string> {
    const content = renderPulsarLoginEmail(message)
    try {
      const { data, error } = await this.resend.emails.send(
        {
          from: this.from,
          to: message.to,
          subject: content.subject,
          html: content.html,
          text: content.text,
          tags: [{ name: "category", value: "passwordless_login" }],
        },
        { idempotencyKey }
      )
      if (error || !data) {
        throw new AppError("PROVIDER_UNAVAILABLE", {
          message: "Resend rejected email",
          retryable: true,
        })
      }
      return data.id
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError("PROVIDER_UNAVAILABLE", {
        cause: error,
        message: "Resend network failure",
        retryable: true,
      })
    }
  }
}
