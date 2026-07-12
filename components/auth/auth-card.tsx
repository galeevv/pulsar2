"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, ArrowRightIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import {
  requestEmailLoginAction,
  verifyEmailOtpAction,
  type AuthActionResult,
} from "@/app/(auth)/actions"
import {
  PulsarAssetCard,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
import { Button } from "@/components/ui/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Separator } from "@/components/ui/separator"

const idleState: AuthActionResult = { status: "idle" }
const resendCooldownMilliseconds = 60_000

export function AuthCard({
  authError,
  invite,
}: {
  authError?: "expired" | "telegram" | "used"
  invite?: string
}) {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [isLinkSent, setIsLinkSent] = React.useState(false)
  const [otp, setOtp] = React.useState("")
  const [state, setState] = React.useState<AuthActionResult>(idleState)
  const [resendAvailableAt, setResendAvailableAt] = React.useState<
    number | null
  >(null)
  const [resendSeconds, setResendSeconds] = React.useState(0)
  const [pending, startTransition] = React.useTransition()
  const otpInputRef = React.useRef<HTMLInputElement>(null)
  const authErrorMessage =
    authError === "telegram"
      ? "Не удалось войти через Telegram. Попробуйте ещё раз."
      : authError === "used"
        ? "Ссылка уже использована. Запросите новую ссылку для входа."
        : authError === "expired"
          ? "Ссылка устарела. Запросите новую ссылку для входа."
          : null

  React.useEffect(() => {
    if (!resendAvailableAt) return

    function updateCountdown() {
      const seconds = Math.max(
        0,
        Math.ceil((resendAvailableAt! - Date.now()) / 1000)
      )
      setResendSeconds(seconds)
      if (seconds === 0) setResendAvailableAt(null)
    }

    updateCountdown()
    const interval = window.setInterval(updateCountdown, 250)
    return () => window.clearInterval(interval)
  }, [resendAvailableAt])

  function startResendCooldown() {
    setResendSeconds(60)
    setResendAvailableAt(Date.now() + resendCooldownMilliseconds)
  }

  function requestLogin() {
    if (!email || pending || (isLinkSent && resendSeconds > 0)) return
    startTransition(async () => {
      const result = await requestEmailLoginAction({ email, invite })
      setState(result)
      if (result.status === "sent") {
        setEmail(result.email ?? email)
        setIsLinkSent(true)
        setOtp("")
        startResendCooldown()
        toast.success(result.message)
      }
    })
  }

  function verifyOtp(completedOtp: string) {
    const normalizedOtp = completedOtp.replace(/\D/g, "").slice(0, 6)
    if (normalizedOtp.length !== 6 || pending) return
    startTransition(async () => {
      const result = await verifyEmailOtpAction({
        email,
        otp: normalizedOtp,
        invite,
      })
      setState(result)
      if (result.status === "authenticated") {
        router.replace("/home")
        router.refresh()
      } else {
        setOtp("")
        window.requestAnimationFrame(() => otpInputRef.current?.focus())
      }
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <PulsarAssetCard
        src="/hero/pulsar.gif"
        alt="PulsarVPN"
        cardClassName="w-full max-w-md"
        contentClassName="relative flex min-h-56 flex-col justify-center gap-4"
      >
        {isLinkSent ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="absolute top-4 left-4"
            aria-label="Изменить email"
            disabled={pending}
            onClick={() => {
              setIsLinkSent(false)
              setOtp("")
              setState(idleState)
            }}
          >
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <CardHeader className="items-center gap-1.5 p-0 text-center">
          <CardTitle>
            {isLinkSent ? "Введите код" : "Добро пожаловать"}
          </CardTitle>
          <CardDescription>
            {isLinkSent
              ? `Код отправлен на ${email}`
              : "Подключиться к Pulsar с помощью"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          {isLinkSent ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <FieldGroup>
                  <Field>
                    <FieldLabel className="sr-only">Код из письма</FieldLabel>
                    <InputOTP
                      ref={otpInputRef}
                      name="otp"
                      value={otp}
                      onChange={(value) => {
                        setOtp(value.replace(/\D/g, "").slice(0, 6))
                        if (state.status === "error") setState(idleState)
                      }}
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      containerClassName="justify-center"
                      disabled={pending}
                      aria-invalid={state.status === "error"}
                      onComplete={verifyOtp}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </Field>
                </FieldGroup>
                {state.status === "error" ? (
                  <p className="text-center text-sm text-destructive">
                    {state.message}
                  </p>
                ) : null}
                {pending ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Проверяем код…
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto px-0 text-sm"
                disabled={pending || resendSeconds > 0}
                onClick={requestLogin}
              >
                {resendSeconds > 0
                  ? `Отправить новое письмо через 0:${String(resendSeconds).padStart(2, "0")}`
                  : "Отправить новое письмо"}
              </Button>
            </div>
          ) : (
            <>
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  requestLogin()
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email" className="sr-only">
                      Email
                    </FieldLabel>
                    <InputGroup className="h-11 rounded-[18px] bg-input/50">
                      <InputGroupInput
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="Email"
                        required
                        disabled={pending}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                      <InputGroupAddon align="inline-end" className="pr-1.5">
                        <InputGroupButton
                          type="submit"
                          size="icon-sm"
                          variant="default"
                          aria-label="Продолжить"
                          disabled={pending}
                        >
                          <ArrowRightIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </FieldGroup>
                {state.status === "error" || authErrorMessage ? (
                  <p className="text-sm text-destructive">
                    {state.status === "error"
                      ? state.message
                      : authErrorMessage}
                  </p>
                ) : null}
              </form>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">или</span>
                <Separator className="flex-1" />
              </div>

              <Button
                type="button"
                variant="outline"
                className={pulsarCtaClass}
                onClick={() =>
                  window.location.assign("/auth/telegram/start?intent=login")
                }
              >
                <SendIcon data-icon="inline-start" />С помощью Telegram
              </Button>
            </>
          )}
        </CardContent>
      </PulsarAssetCard>
    </main>
  )
}
