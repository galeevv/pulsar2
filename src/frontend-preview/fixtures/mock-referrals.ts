export const previewReferralProfile = {
  userId: "preview-user",
  inviteCode: "",
  isEnabled: false,
}

export const previewReferralInvites: Array<{
  id: string
  invitedUserId: string
  status: string
  createdAt: Date
  invited: {
    authIdentities: Array<{ provider: string; providerSubject: string }>
  }
}> = []

export const previewPayouts: Array<{
  id: string
  amountRub: number
  payoutDetails: string
  status: string
  createdAt: Date
  user: {
    authIdentities: Array<{ provider: string; providerSubject: string }>
  }
}> = []
