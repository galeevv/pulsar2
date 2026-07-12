import type { ComponentProps } from "react"
import {
  AlertCircleIcon,
  KeyRoundIcon,
  Link2Icon,
  MinusIcon,
  PlusIcon,
  RadioIcon,
  SmartphoneIcon,
} from "lucide-react"
import { CopyButton } from "@/components/app/copy-button"
import {
  PreviewButton,
  PreviewForm,
} from "@/components/frontend-preview/preview-form"
import {
  PulsarActionRow,
  PulsarAssetCard,
  PulsarIconContainer,
  pulsarLinkButtonClass,
} from "@/components/app/pulsar-primitives"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { previewPricing } from "@/src/frontend-preview/fixtures/mock-pricing"
import { previewSubscription } from "@/src/frontend-preview/fixtures/mock-subscription"
import type {
  PreviewSubscription,
  PreviewSubscriptionStatus,
} from "@/src/frontend-preview/view-models"

export default function SubscriptionPage() {
  const subscription = previewSubscription
  const settings = previewPricing
  const status = subscription?.status ?? "NONE"
  const hasActiveSubscription =
    subscription && ["ACTIVE", "TRIAL"].includes(status)
  const hasSubscriptionRecord = Boolean(subscription && status !== "NONE")
  const subscriptionSummary = getSubscriptionSummary(subscription, status)
  const subscriptionProgress = subscription
    ? getRemainingSubscriptionProgress(subscription)
    : 0
  const subscriptionProgressTone = subscription
    ? getProgressTone(subscription, status, subscriptionProgress)
    : "inactive"

  return (
    <main className="pulsar-container">
      <PulsarAssetCard
        src="/details/observed.gif"
        alt="PulsarVPN"
        contentClassName="flex min-h-56 flex-col justify-center gap-4"
      >
        {hasSubscriptionRecord ? (
          <div className="flex flex-col items-center text-center">
            <p className="text-[26px] leading-8 font-semibold tracking-normal">
              {subscriptionSummary.title}
            </p>
          </div>
        ) : null}

        {!hasSubscriptionRecord ? (
          <SubscriptionEmptyState settings={settings} />
        ) : subscription ? (
          <>
            <SubscriptionUrlCard url={subscription.subscriptionUrl} />

            <div className="soft-panel flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Период доступа</span>
                <span className="font-medium">
                  {subscription.expiresAt
                    ? `до ${formatSubscriptionDate(subscription.expiresAt)}`
                    : "без срока"}
                </span>
              </div>
              <Progress
                value={subscriptionProgress}
                aria-label="Период доступа подписки"
                data-tone={subscriptionProgressTone}
                className="pulsar-progress w-full"
              />
            </div>

            {subscription.lastUserFriendlyError ? (
              <Alert>
                <AlertCircleIcon />
                <AlertTitle>Нужна проверка</AlertTitle>
                <AlertDescription>
                  {subscription.lastUserFriendlyError}
                </AlertDescription>
              </Alert>
            ) : null}

            {hasActiveSubscription && subscription.subscriptionUrl ? (
              <PreviewButton className={pulsarLinkButtonClass()}>
                <Link2Icon data-icon="inline-start" />
                Подключить в Happ
              </PreviewButton>
            ) : (
              <SubscriptionPaymentAction
                settings={settings}
                triggerLabel="Продлить подписку"
              />
            )}
          </>
        ) : (
          <SubscriptionEmptyState settings={settings} />
        )}
      </PulsarAssetCard>

      {hasSubscriptionRecord && subscription ? (
        <ConnectedDevicesCard
          maxDeviceLimit={settings.maxDeviceLimit}
          minDeviceLimit={settings.minDeviceLimit}
          subscription={subscription}
        />
      ) : null}
    </main>
  )
}

function SubscriptionEmptyState({
  settings,
}: {
  settings: ComponentProps<typeof SubscriptionPaymentAction>["settings"]
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RadioIcon />
        </EmptyMedia>
        <EmptyTitle>Оплатите подписку</EmptyTitle>
        <EmptyDescription>
          После оплаты здесь появится ссылка для Happ.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="w-full">
        <SubscriptionPaymentAction
          settings={settings}
          triggerLabel="Оплатить подписку"
        />
      </EmptyContent>
    </Empty>
  )
}

function SubscriptionUrlCard({ url }: { url: string | null }) {
  return (
    <PulsarActionRow
      icon={KeyRoundIcon}
      title="Ключ подписки"
      titleClassName="text-xs font-normal text-muted-foreground"
      description={
        <span className="font-mono text-sm text-foreground">
          {url ? formatCompactSubscriptionUrl(url) : "Ссылка появится позже"}
        </span>
      }
      action={
        url ? (
          <CopyButton value={url} label="Скопировать ключ" iconOnly />
        ) : null
      }
    />
  )
}

function ConnectedDevicesCard({
  maxDeviceLimit,
  minDeviceLimit,
  subscription,
}: {
  maxDeviceLimit: number
  minDeviceLimit: number
  subscription: PreviewSubscription | null
}) {
  const deviceLimit = subscription?.deviceLimit ?? 0

  return (
    <Card className="rounded-3xl border border-border/70 bg-card/40 py-0">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Подключенные устройства</p>
            <p className="text-sm text-muted-foreground">
              {subscription
                ? `Активно: 0 из ${formatDeviceLimit(deviceLimit)}`
                : "Появятся после оплаты подписки"}
            </p>
          </div>
          {subscription ? (
            <div className="flex items-center gap-2">
              <DeviceLimitButton
                ariaLabel="Уменьшить лимит устройств"
                disabled={deviceLimit <= minDeviceLimit}
                icon="minus"
                value={deviceLimit - 1}
              />
              <span className="w-6 text-center text-sm font-semibold tabular-nums">
                {deviceLimit}
              </span>
              <DeviceLimitButton
                ariaLabel="Увеличить лимит устройств"
                disabled={deviceLimit >= maxDeviceLimit}
                icon="plus"
                value={deviceLimit + 1}
              />
            </div>
          ) : null}
        </div>

        {subscription ? (
          <div className="grid gap-3">
            {Array.from({ length: deviceLimit }).map((_, index) => (
              <div
                key={index}
                className="soft-panel flex items-center justify-between gap-3 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <PulsarIconContainer icon={SmartphoneIcon} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      Добавить устройство
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      VPN ещё на одном устройстве
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Свободно</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="soft-panel flex items-center gap-3 p-4">
            <PulsarIconContainer icon={SmartphoneIcon} size="md" />
            <p className="text-sm text-muted-foreground">
              Оформите подписку, чтобы подключить устройства.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DeviceLimitButton({
  ariaLabel,
  disabled,
  icon,
  value,
}: {
  ariaLabel: string
  disabled: boolean
  icon: "minus" | "plus"
  value: number
}) {
  const Icon = icon === "minus" ? MinusIcon : PlusIcon

  return (
    <PreviewForm>
      <input type="hidden" name="deviceLimit" value={value} />
      <Button
        type="submit"
        size="icon-sm"
        variant="outline"
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <Icon />
      </Button>
    </PreviewForm>
  )
}

function getSubscriptionSummary(
  subscription: PreviewSubscription | null,
  status: PreviewSubscriptionStatus
) {
  if (!subscription || status === "NONE") {
    return {
      title: "Оплатите подписку",
    }
  }

  if (status === "EXPIRED" || status === "CANCELED") {
    return {
      title: "Подписка закончилась",
    }
  }

  return {
    title: "Подписка",
  }
}

function getProgressTone(
  subscription: { expiresAt: Date | null },
  status: string,
  progress: number
) {
  if (status === "EXPIRED" || status === "CANCELED" || progress <= 0) {
    return "danger"
  }

  if (!subscription.expiresAt) {
    return "healthy"
  }

  const daysLeft = getDaysLeft(subscription.expiresAt)

  if (daysLeft <= 7 || progress <= 18) {
    return "danger"
  }

  if (daysLeft <= 14 || progress <= 35) {
    return "warning"
  }

  return "healthy"
}

function getRemainingSubscriptionProgress(subscription: {
  startsAt: Date | null
  expiresAt: Date | null
}) {
  if (!subscription.startsAt || !subscription.expiresAt) {
    return 100
  }

  const start = subscription.startsAt.getTime()
  const end = subscription.expiresAt.getTime()
  const total = end - start

  if (total <= 0) {
    return 0
  }

  const remaining = end - Date.now()
  const value = (remaining / total) * 100

  return Math.min(100, Math.max(0, Math.round(value)))
}

function getDaysLeft(expiresAt: Date) {
  const msInDay = 24 * 60 * 60 * 1000

  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / msInDay))
}

function formatSubscriptionDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function formatCompactSubscriptionUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean)
    const token = pathSegments[pathSegments.length - 1] ?? ""

    if (!token) {
      return parsedUrl.host
    }

    return `${parsedUrl.host}/...${token.slice(-8)}`
  } catch {
    const token = url.split("/").filter(Boolean).at(-1) ?? ""

    return token ? `...${token.slice(-10)}` : url
  }
}

function formatDeviceLimit(deviceLimit: number) {
  return `${deviceLimit} ${pluralizeRu(deviceLimit, [
    "устройство",
    "устройства",
    "устройств",
  ])}`
}

function pluralizeRu(value: number, forms: [string, string, string]) {
  const abs = Math.abs(value)
  const mod10 = abs % 10
  const mod100 = abs % 100

  if (mod10 === 1 && mod100 !== 11) {
    return forms[0]
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1]
  }

  return forms[2]
}
