import { GiftIcon, Link2Icon, UsersIcon, WalletIcon } from "lucide-react"

import { CopyButton } from "@/components/app/copy-button"
import { PayoutDialog } from "@/components/app/payout-dialog"
import {
  PulsarActionRow,
  PulsarAssetCard,
  PulsarIconContainer,
} from "@/components/app/pulsar-primitives"
import { ReferralsMetrics } from "@/components/app/referrals-metrics"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import { previewPricing } from "@/src/frontend-preview/fixtures/mock-pricing"
import {
  previewPayouts,
  previewReferralInvites,
  previewReferralProfile,
} from "@/src/frontend-preview/fixtures/mock-referrals"
import { previewSubscription } from "@/src/frontend-preview/fixtures/mock-subscription"
import { previewUser } from "@/src/frontend-preview/fixtures/mock-user"

export default function ReferralsPage() {
  const user = previewUser
  const profile = previewReferralProfile
  const settings = previewPricing
  const subscription = previewSubscription
  const invites = previewReferralInvites
  const payouts = previewPayouts
  const subscriptionStatus = subscription?.status ?? "NONE"
  const shouldShowReferralEmpty =
    !profile?.isEnabled && (!subscription || subscriptionStatus === "NONE")

  if (shouldShowReferralEmpty) {
    return (
      <main className="pulsar-container">
        <PulsarAssetCard
          src="/details/physics.gif"
          alt="Реферальная программа Pulsar"
          contentClassName="flex min-h-56 flex-col justify-center"
        >
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GiftIcon />
              </EmptyMedia>
              <EmptyTitle>
                Реферальная программа откроется после оплаты
              </EmptyTitle>
              <EmptyDescription>
                После подтверждения платежа здесь появится ваша ссылка.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <SubscriptionPaymentAction
                settings={settings}
                triggerLabel="Оплатить подписку"
              />
            </EmptyContent>
          </Empty>
        </PulsarAssetCard>
      </main>
    )
  }

  const invitedCount = invites.length
  const activeCount = invites.filter(
    (invite) => invite.status === "CONVERTED"
  ).length
  const paidOutRub = payouts
    .filter((payout) => payout.status === "PAID")
    .reduce((sum, payout) => sum + payout.amountRub, 0)
  const canRequestPayout = user.balanceRub >= settings.minimalPayoutRub
  const inviteItems = invites.map((invite) => ({
    createdAtLabel: formatReferralDate(invite.createdAt),
    id: invite.id,
    statusLabel: formatReferralStatus(invite.status),
    userLabel: getInvitedUserLabel(invite.invited.authIdentities),
  }))
  const activeInviteItems = inviteItems.filter(
    (_, index) => invites[index]?.status === "CONVERTED"
  )
  const payoutItems = payouts.map((payout) => ({
    amountLabel: formatPreviewRub(payout.amountRub),
    createdAtLabel: formatReferralDate(payout.createdAt),
    id: payout.id,
    statusLabel: formatReferralStatus(payout.status),
  }))
  const inviteUrl = `https://preview.invalid/?invite=${profile.inviteCode}`

  return (
    <main className="pulsar-container">
      <PulsarAssetCard
        src="/details/physics.gif"
        alt="Реферальная программа Pulsar"
        contentClassName="flex min-h-56 flex-col justify-center gap-4"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[26px] leading-8 font-semibold tracking-normal">
            Реферальная программа
          </p>
        </div>

        <PulsarActionRow
          icon={WalletIcon}
          title="Баланс"
          titleClassName="text-[11px] leading-4 font-normal text-muted-foreground"
          description={
            <span className="text-base leading-5 font-semibold text-foreground">
              {formatPreviewRub(user.balanceRub)}
            </span>
          }
          action={
            <PayoutDialog
              buttonIcon={false}
              canRequestPayout={canRequestPayout}
              defaultAmountRub={Math.min(
                user.balanceRub || settings.minimalPayoutRub,
                Math.max(user.balanceRub, settings.minimalPayoutRub)
              )}
              minimalPayoutRub={settings.minimalPayoutRub}
              triggerClassName="h-9 w-auto rounded-[14px] px-3"
            />
          }
        />

        <ReferralLinkCard inviteUrl={inviteUrl} />

        <ReferralsMetrics
          activeInvites={activeInviteItems}
          activeValue={String(activeCount)}
          invitedValue={String(invitedCount)}
          invites={inviteItems}
          paidOutValue={formatPreviewRub(paidOutRub)}
          payouts={payoutItems}
        />

        <ReferralStepsCarousel />
      </PulsarAssetCard>
    </main>
  )
}

function ReferralLinkCard({ inviteUrl }: { inviteUrl: string }) {
  return (
    <PulsarActionRow
      icon={Link2Icon}
      title="Ваша ссылка"
      titleClassName="text-xs font-normal text-muted-foreground"
      description={
        <span className="font-mono text-sm text-foreground">
          {formatCompactReferralUrl(inviteUrl)}
        </span>
      }
      action={
        <CopyButton
          value={inviteUrl}
          label="Скопировать ссылку"
          iconOnly
          className="size-9"
        />
      }
    />
  )
}

function ReferralStepsCarousel() {
  return (
    <Carousel className="w-full" opts={{ align: "start" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Как это работает</p>
        <div className="flex items-center gap-2">
          <CarouselPrevious className="static inset-auto m-0 translate-x-0 translate-y-0" />
          <CarouselNext className="static inset-auto m-0 translate-x-0 translate-y-0" />
        </div>
      </div>
      <CarouselContent className="-ml-3 pt-3">
        {referralSteps.map((step) => (
          <CarouselItem key={step.title} className="basis-full pl-3">
            <div className="soft-panel flex flex-col gap-3 p-4">
              <PulsarIconContainer icon={step.icon} />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-sm leading-5 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}

const referralSteps = [
  {
    title: "Пригласите друга и получите 75 ₽",
    description: "Бонус начислим после его первой оплаты.",
    icon: GiftIcon,
  },
  {
    title: "Бонус новым пользователям",
    description: "Ваш друг получит 3 дня подписки бесплатно.",
    icon: UsersIcon,
  },
  {
    title: "Накопили 150 ₽ — выводите",
    description: "Создайте заявку прямо из личного кабинета.",
    icon: WalletIcon,
  },
]

function formatCompactReferralUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const code = parsedUrl.searchParams.get("invite")

    if (code) {
      return `${parsedUrl.host}/?invite=${code.slice(0, 4)}...${code.slice(-4)}`
    }

    return parsedUrl.host
  } catch {
    return url.length > 28 ? `${url.slice(0, 18)}...${url.slice(-6)}` : url
  }
}

function formatReferralStatus(status: string) {
  const labels: Record<string, string> = {
    APPROVED: "Одобрено",
    AVAILABLE: "Доступно",
    CANCELED: "Отменено",
    PAID: "Выплачено",
    PENDING: "В обработке",
    REJECTED: "Отклонено",
    RESERVED: "Зарезервировано",
  }

  return labels[status] ?? status.toLowerCase()
}

function getInvitedUserLabel(
  identities: Array<{ provider: string; providerSubject: string }>
) {
  const email = identities.find(
    (identity) => identity.provider === "EMAIL"
  )?.providerSubject
  const telegram = identities.find(
    (identity) => identity.provider === "TELEGRAM"
  )?.providerSubject

  return email ?? (telegram ? `Telegram ${telegram}` : "Пользователь Pulsar")
}

function formatReferralDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}
