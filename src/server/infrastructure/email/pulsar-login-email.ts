import type { LoginEmailMessage } from "@/src/server/infrastructure/email/email-gateway"

export function renderPulsarLoginEmail(message: LoginEmailMessage): {
  html: string
  subject: string
  text: string
} {
  const otp = escapeHtml(message.otp)
  const magicUrl = escapeHtml(message.magicUrl)
  const minutes = message.expiresInMinutes
  return {
    subject: "Код для входа в Pulsar",
    text: [
      `Код входа в Pulsar: ${message.otp}`,
      `Или откройте ссылку: ${message.magicUrl}`,
      `Код и ссылка действуют ${minutes} минут. Если это были не вы, проигнорируйте письмо.`,
    ].join("\n\n"),
    html: `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#080808;color:#f5f5f5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">Ваш одноразовый код Pulsar: ${otp}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#080808;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;border:1px solid #292929;border-radius:24px;background:#0c0c0c;overflow:hidden">
        <tr><td style="padding:30px 30px 20px;text-align:center;border-bottom:1px solid #242424">
          <div style="display:inline-block;padding:8px 13px;border:1px solid #303030;border-radius:999px;color:#f5f5f5;font-size:11px;font-weight:700;letter-spacing:.18em">PULSAR</div>
        </td></tr>
        <tr><td style="padding:26px 30px 10px;text-align:center">
          <h1 style="margin:0 0 7px;font-size:24px;line-height:1.25;font-weight:700;color:#f5f5f5">Вход в аккаунт</h1>
          <p style="margin:0;color:#969696;font-size:14px;line-height:1.55">Введите код в приложении или откройте ссылку.</p>
        </td></tr>
        <tr><td style="padding:14px 30px;text-align:center">
          <div style="padding:18px 12px;border:1px solid #303030;border-radius:18px;background:#121212;color:#ffffff;font-size:34px;line-height:1;font-weight:700;letter-spacing:.22em">${otp}</div>
        </td></tr>
        <tr><td style="padding:10px 30px 8px;text-align:center">
          <a href="${magicUrl}" style="display:block;padding:14px 20px;border-radius:15px;background:#f1f1f1;color:#111111;text-decoration:none;font-size:14px;font-weight:700">Войти в Pulsar</a>
        </td></tr>
        <tr><td style="padding:18px 30px 30px;text-align:center;color:#777777;font-size:12px;line-height:1.6">
          Код и ссылка действуют ${minutes} минут и используются один раз.<br>
          Не запрашивали вход? Просто проигнорируйте письмо.
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#555555;font-size:11px">Pulsar Cloud · безопасный доступ</p>
    </td></tr>
  </table>
</body>
</html>`,
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }
    return entities[character]!
  })
}
