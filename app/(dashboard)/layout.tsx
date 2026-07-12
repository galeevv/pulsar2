import { BottomNav } from "@/components/app/bottom-nav"
import { requireSession } from "@/src/server/transport/next/auth-dal"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSession()

  return (
    <div className="pulsar-page">
      {children}
      <BottomNav />
    </div>
  )
}
