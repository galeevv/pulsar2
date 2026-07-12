import Link from "next/link"
import { ChevronRightIcon, GiftIcon } from "lucide-react"

import {
  PulsarAssetCard,
  PulsarIconContainer,
} from "@/components/app/pulsar-primitives"
import { SetupVpnAction } from "@/components/app/setup-vpn-action"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { previewPricing } from "@/src/frontend-preview/fixtures/mock-pricing"
import { previewSubscription } from "@/src/frontend-preview/fixtures/mock-subscription"
import type {
  PreviewSubscription,
  PreviewSubscriptionStatus,
} from "@/src/frontend-preview/view-models"

export default function HomePage() {
  const subscription = previewSubscription
  const settings = previewPricing
  const status = subscription?.status ?? "NONE"
  const renewalLabel =
    status === "NONE" ? "Оплатить подписку" : "Продлить подписку"
  const subscriptionSummary = getHomeSubscriptionSummary(subscription, status)

  return (
    <main className="pulsar-container">
      <PulsarAssetCard
        src="/hero/pulsar.gif"
        alt="PulsarVPN"
        contentClassName="flex min-h-56 flex-col items-center justify-center gap-5 text-center"
      >
        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex w-full flex-col items-center gap-1">
            <p className="text-sm leading-5 text-muted-foreground">
              {subscriptionSummary.caption}
            </p>
            <p className="w-full text-center text-[26px] leading-8 font-semibold tracking-normal whitespace-nowrap">
              {subscriptionSummary.title}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Badge>{getSubscriptionStatusLabel(status)}</Badge>
            {subscription ? (
              <Badge variant="secondary">
                {formatDeviceLimit(subscription.deviceLimit)}
              </Badge>
            ) : null}
            {subscription?.lteEnabled ? (
              <Badge variant="secondary">LTE</Badge>
            ) : null}
          </div>
        </div>
        <div className="grid w-full gap-3">
          <SubscriptionPaymentAction
            settings={settings}
            triggerLabel={renewalLabel}
          />
          <SetupVpnAction subscriptionUrl={subscription?.subscriptionUrl} />
        </div>
      </PulsarAssetCard>

      <Link
        href="/referrals"
        className="group block"
        aria-label="Открыть реферальную систему"
      >
        <Card className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0 transition-colors hover:bg-card/55">
          <CardContent className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
            <PulsarIconContainer
              icon={GiftIcon}
              size="md"
              className="text-muted-foreground transition-colors group-hover:text-foreground"
            />
            <div className="relative z-10 min-w-0">
              <p className="text-sm leading-5 text-muted-foreground transition-colors group-hover:text-foreground">
                <span className="block">Друг получает 3 дня бесплатно.</span>
                <span className="block">
                  Вы получаете 75 ₽ после его оплаты.
                </span>
              </p>
            </div>
            <ChevronRightIcon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
          </CardContent>
        </Card>
      </Link>
    </main>
  )
}

function getHomeSubscriptionSummary(
  subscription: PreviewSubscription | null,
  status: PreviewSubscriptionStatus
) {
  if (!subscription || status === "NONE") {
    return {
      caption: "Подписка не активна",
      title: "Оплатите подписку",
    }
  }

  if (status === "EXPIRED" || status === "CANCELED") {
    return {
      caption: subscription.expiresAt
        ? `Доступ закончился ${formatSubscriptionDate(subscription.expiresAt)}`
        : "Доступ не активен",
      title: "Подписка закончилась",
    }
  }

  if (!subscription.expiresAt) {
    return {
      caption: "Подписка активна",
      title: "Доступ подключён",
    }
  }

  const daysLeft = formatDaysLeft(subscription.expiresAt)

  return {
    caption: `До ${formatSubscriptionDate(subscription.expiresAt)}`,
    title: `Осталось ${formatDaysLeftLabel(daysLeft)}`,
  }
}

function getSubscriptionStatusLabel(status: PreviewSubscriptionStatus) {
  const labels: Record<PreviewSubscriptionStatus, string> = {
    NONE: "Не активна",
    TRIAL: "Пробный период",
    ACTIVE: "Активна",
    EXPIRED: "Истекла",
    CANCELED: "Отменена",
  }

  return labels[status]
}

function formatSubscriptionDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function formatDaysLeft(expiresAt: Date) {
  const msInDay = 24 * 60 * 60 * 1000

  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / msInDay))
}

function formatDaysLeftLabel(days: number) {
  return `${days} ${pluralizeRu(days, ["день", "дня", "дней"])}`
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
