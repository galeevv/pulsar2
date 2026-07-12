import { AuthCard } from "@/components/auth/auth-card"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    authError?: "expired" | "telegram" | "used"
    invite?: string
  }>
}) {
  const params = await searchParams

  return <AuthCard authError={params.authError} invite={params.invite} />
}
