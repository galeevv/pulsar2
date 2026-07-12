import assert from "node:assert/strict"
import test from "node:test"

import { renderPulsarLoginEmail } from "@/src/server/infrastructure/email/pulsar-login-email"

test("login email follows the monochrome Pulsar interface palette", () => {
  const rendered = renderPulsarLoginEmail({
    kind: "AUTH_LOGIN_EMAIL",
    to: "user@example.com",
    otp: "123456",
    magicUrl: "https://app.pulsar-cloud.space/auth/verify/link?token=test",
    expiresInMinutes: 10,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  })
  assert.match(rendered.html, /background:#080808/)
  assert.match(rendered.html, /background:#f1f1f1/)
  assert.match(rendered.html, /border:1px solid #292929/)
  assert.doesNotMatch(rendered.html, /linear-gradient|#8d9cff|#aab4ff/)
  assert.match(rendered.text, /123456/)
})
