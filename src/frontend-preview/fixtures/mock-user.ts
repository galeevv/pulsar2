import type { PreviewIdentity } from "@/src/frontend-preview/view-models"

export const previewUser = {
  id: "preview-user",
  email: "preview@pulsar.local",
  telegramId: null as string | null,
  balanceRub: 0,
  role: "USER" as const,
  createdAt: new Date("2026-07-12T09:00:00.000Z"),
}

export const previewUserIdentities: PreviewIdentity[] = [
  { provider: "EMAIL", providerSubject: previewUser.email },
]
