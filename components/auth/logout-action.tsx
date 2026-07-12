"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { logoutAction } from "@/app/(auth)/actions"
import { AlertDialogAction } from "@/components/ui/alert-dialog"

export function LogoutAction({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  return (
    <AlertDialogAction
      type="button"
      variant="outline"
      disabled={pending}
      className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => {
        startTransition(async () => {
          await logoutAction()
          router.replace("/")
          router.refresh()
        })
      }}
    >
      {children}
    </AlertDialogAction>
  )
}
