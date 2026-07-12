"use client"

import type { ReactNode } from "react"
import { CheckIcon, MailIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function LoginMethodsManager({
  email,
  telegramId,
  telegramStatus,
}: {
  email: string | null
  telegramId: string | null
  telegramStatus?: "already-linked" | "error" | "linked"
}) {
  return (
    <div className="soft-panel flex flex-col gap-3 p-3">
      <p className="text-center text-sm font-semibold">Способы входа</p>
      <MethodRow
        icon={MailIcon}
        label="Email"
        value={email ?? "Не привязан"}
        action={
          email ? (
            <ConnectedBadge />
          ) : (
            <CompactLinkButton
              onClick={() =>
                toast.info("Привязка email будет доступна в следующем этапе.")
              }
            />
          )
        }
      />
      <MethodRow
        icon={SendIcon}
        label="Telegram"
        value={telegramId ? `id: ${telegramId}` : "Не привязан"}
        action={
          telegramId ? (
            <ConnectedBadge />
          ) : (
            <CompactLinkButton
              onClick={() => {
                window.location.assign("/auth/telegram/start?intent=link")
              }}
            />
          )
        }
      />
      {telegramStatus ? (
        <p
          className={
            telegramStatus === "linked"
              ? "text-center text-xs text-muted-foreground"
              : "text-center text-xs text-destructive"
          }
        >
          {telegramStatus === "linked"
            ? "Telegram успешно привязан."
            : telegramStatus === "already-linked"
              ? "Этот Telegram уже используется другим аккаунтом."
              : "Не удалось привязать Telegram. Попробуйте ещё раз."}
        </p>
      ) : null}
    </div>
  )
}

function CompactLinkButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 shrink-0 rounded-xl px-3 text-xs"
      onClick={onClick}
    >
      Привязать
    </Button>
  )
}

function ConnectedBadge() {
  return (
    <Badge variant="secondary" className="shrink-0">
      <CheckIcon data-icon="inline-start" />
      Привязан
    </Badge>
  )
}

function MethodRow({
  icon: Icon,
  label,
  value,
  action,
}: {
  icon: typeof MailIcon
  label: string
  value: string
  action: ReactNode
}) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/25 p-2.5 pl-3">
      <div className="flex min-w-0 items-center gap-3">
        <PulsarIconContainer icon={Icon} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium">{value}</p>
        </div>
      </div>
      {action}
    </div>
  )
}
