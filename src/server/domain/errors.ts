export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "CHALLENGE_INVALID"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_USED"
  | "CHALLENGE_ATTEMPTS_EXHAUSTED"
  | "UNAUTHENTICATED"
  | "IDENTITY_ALREADY_LINKED"
  | "TELEGRAM_AUTH_FAILED"
  | "CONFIGURATION_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "INTERNAL_ERROR"

const PUBLIC_MESSAGES: Record<AppErrorCode, string> = {
  VALIDATION_ERROR: "Проверьте введённые данные.",
  RATE_LIMITED: "Слишком много попыток. Попробуйте немного позже.",
  CHALLENGE_INVALID: "Неверный код. Проверьте письмо и попробуйте снова.",
  CHALLENGE_EXPIRED: "Код или ссылка устарели. Запросите новое письмо.",
  CHALLENGE_USED: "Эта ссылка или код уже использованы.",
  CHALLENGE_ATTEMPTS_EXHAUSTED:
    "Лимит попыток исчерпан. Запросите новое письмо.",
  UNAUTHENTICATED: "Войдите в аккаунт, чтобы продолжить.",
  IDENTITY_ALREADY_LINKED:
    "Этот способ входа уже используется другим аккаунтом.",
  TELEGRAM_AUTH_FAILED: "Не удалось войти через Telegram. Попробуйте ещё раз.",
  CONFIGURATION_ERROR: "Сервис временно недоступен.",
  PROVIDER_UNAVAILABLE: "Не удалось отправить письмо. Попробуйте позже.",
  INTERNAL_ERROR: "Что-то пошло не так. Попробуйте позже.",
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly publicMessage: string
  readonly status: number
  readonly retryable: boolean
  readonly retryAfterSeconds?: number
  override readonly cause?: unknown

  constructor(
    code: AppErrorCode,
    options: {
      cause?: unknown
      message?: string
      publicMessage?: string
      retryable?: boolean
      retryAfterSeconds?: number
      status?: number
    } = {}
  ) {
    super(options.message ?? code)
    this.name = "AppError"
    this.code = code
    this.publicMessage = options.publicMessage ?? PUBLIC_MESSAGES[code]
    this.status = options.status ?? statusFor(code)
    this.retryable = options.retryable ?? false
    this.retryAfterSeconds = options.retryAfterSeconds
    this.cause = options.cause
  }
}

function statusFor(code: AppErrorCode): number {
  if (code === "VALIDATION_ERROR") return 400
  if (code === "UNAUTHENTICATED") return 401
  if (code === "IDENTITY_ALREADY_LINKED") return 409
  if (code === "TELEGRAM_AUTH_FAILED") return 400
  if (code === "RATE_LIMITED") return 429
  if (code === "PROVIDER_UNAVAILABLE") return 503
  return code.startsWith("CHALLENGE_") ? 400 : 500
}

export function asAppError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError("INTERNAL_ERROR", { cause: error })
}
