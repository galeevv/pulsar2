import Link from "next/link"
import {
  ChevronRightIcon,
  FileTextIcon,
  HeadphonesIcon,
  LogOutIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { LogoutAction } from "@/components/auth/logout-action"
import {
  PulsarActionRow,
  PulsarAssetCard,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
import { LoginMethodsManager } from "@/components/app/login-methods-manager"
import { requireSession } from "@/src/server/transport/next/auth-dal"

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    telegram?: "already-linked" | "error" | "linked"
  }>
}) {
  const session = await requireSession()
  const params = await searchParams

  return (
    <main className="pulsar-container">
      <PulsarAssetCard
        src="/details/birth.gif"
        alt="Профиль Pulsar"
        contentClassName="flex min-h-56 flex-col justify-center gap-4"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[26px] leading-8 font-semibold tracking-normal">
            Профиль
          </p>
        </div>

        <LoginMethodsManager
          email={session.email}
          telegramId={session.telegramId}
          telegramStatus={params.telegram}
        />

        <Link href="/support" className="group block">
          <PulsarActionRow
            icon={HeadphonesIcon}
            title="Написать в поддержку"
            description="Поможем с доступом и оплатой"
            className="transition-colors group-hover:bg-card/55"
            trailing={
              <ChevronRightIcon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            }
          />
        </Link>

        <LegalCard />

        <LogoutConfirmDialog />
      </PulsarAssetCard>
    </main>
  )
}

function LogoutConfirmDialog() {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={`${pulsarCtaClass} text-destructive hover:bg-destructive/10 hover:text-destructive`}
          />
        }
      >
        <LogOutIcon data-icon="inline-start" />
        Выйти из аккаунта
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Выйти из аккаунта?</AlertDialogTitle>
          <AlertDialogDescription>
            Для возвращения в личный кабинет нужно будет снова войти через email
            или Telegram.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <LogoutAction>Выйти</LogoutAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function LegalCard() {
  return (
    <Link href="/legal" className="group block">
      <PulsarActionRow
        icon={FileTextIcon}
        title="Юридическая информация"
        description="Оферта, политика и соглашение"
        className="transition-colors group-hover:bg-card/55"
        trailing={
          <ChevronRightIcon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
        }
      />
    </Link>
  )
}
