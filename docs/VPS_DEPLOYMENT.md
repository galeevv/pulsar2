# Pulsar 2.0 VPS deployment handoff

This is an execution-ready handoff for an operator or coding agent deploying
Pulsar on the VPS behind `app.pulsar-cloud.space`. Never copy development
secrets to production. Rotate every secret that has appeared in chat first.

## Preconditions

- Ubuntu/Debian VPS with ports 22, 80, and 443 allowed.
- `app.pulsar-cloud.space`, `pulsar-cloud.space`, and
  `www.pulsar-cloud.space` resolve to the VPS.
- Node.js 24 installed system-wide so `/usr/bin/node` and `/usr/bin/npm` exist.
- Caddy and `sqlite3` installed.
- Remnawave routes for `panel` and `sub` are preserved separately.
- In BotFather Web Login, the exact redirect URI
  `https://app.pulsar-cloud.space/auth/telegram/callback` and trusted origin
  `https://app.pulsar-cloud.space` are registered; signing remains RS256.
- Resend has verified the sending domain used by `EMAIL_FROM`.

## Filesystem and service account

Run as root:

```bash
adduser --system --group --home /opt/pulsar2 pulsar
mkdir -p /opt/pulsar2 /etc/pulsar /var/backups/pulsar
chown -R pulsar:pulsar /opt/pulsar2 /var/backups/pulsar
install -m 0750 -o root -g pulsar -d /etc/pulsar
```

Place the repository contents in `/opt/pulsar2`, then:

```bash
chown -R pulsar:pulsar /opt/pulsar2
```

## Production environment

Create `/etc/pulsar/pulsar.env` with mode `0600`, owned by root:

```env
DATABASE_URL=file:./data/pulsar.db
NEXT_PUBLIC_APP_URL=https://app.pulsar-cloud.space
SESSION_COOKIE_NAME=pulsar_session

AUTH_TOKEN_SECRET=<new-random-base64url-secret>
OUTBOX_ENCRYPTION_KEY=<new-random-32-byte-base64-key>
AUTH_OTP_TTL_SECONDS=600
AUTH_MAGIC_LINK_TTL_SECONDS=600
AUTH_SESSION_TTL_DAYS=180
AUTH_MAX_ATTEMPTS=5
AUTH_EMAIL_RATE_LIMIT=5
AUTH_IP_RATE_LIMIT=20
AUTH_RATE_LIMIT_WINDOW_SECONDS=900
AUTH_RESEND_COOLDOWN_SECONDS=60

RESEND_API_KEY=<new-resend-key>
EMAIL_FROM="Pulsar <auth@pulsar-cloud.space>"
OUTBOX_POLL_INTERVAL_MS=2000
OUTBOX_BATCH_SIZE=10

TELEGRAM_OIDC_CLIENT_ID=<botfather-client-id>
TELEGRAM_OIDC_CLIENT_SECRET=<new-botfather-web-login-secret>
TELEGRAM_OIDC_REDIRECT_URI=https://app.pulsar-cloud.space/auth/telegram/callback
TELEGRAM_BOT_USERNAME=@pulsarcloud_bot
TELEGRAM_BOT_TOKEN=<new-token-only-if-bot-api-is-needed>
```

Generate the two application secrets on the server:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
chown root:pulsar /etc/pulsar/pulsar.env
chmod 0640 /etc/pulsar/pulsar.env
```

The Bot API token is not needed for OIDC login. Keep it empty unless a later
bot-message/webhook feature uses it.

## Install, migrate, build

Run from `/opt/pulsar2`:

```bash
sudo -u pulsar npm ci
sudo -u pulsar bash -lc 'cd /opt/pulsar2; set -a; source /etc/pulsar/pulsar.env; set +a; npm run db:migrate'
sudo -u pulsar bash -lc 'cd /opt/pulsar2; set -a; source /etc/pulsar/pulsar.env; set +a; npm run build'
```

Keep values containing spaces quoted as shown. Never print the environment in
CI or deployment logs.

## systemd

```bash
cp /opt/pulsar2/ops/systemd/pulsar-web.service /etc/systemd/system/
cp /opt/pulsar2/ops/systemd/pulsar-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now pulsar-web pulsar-worker
systemctl status pulsar-web pulsar-worker --no-pager
```

Inspect logs without dumping environment values:

```bash
journalctl -u pulsar-web -u pulsar-worker -n 200 --no-pager
```

## Caddy and TLS

Merge `ops/Caddyfile.pulsar` into the existing Caddyfile without replacing the
Remnawave `panel` and `sub` blocks:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
curl -I https://app.pulsar-cloud.space/
```

## Deployment verification

1. Request an email code and confirm the worker logs `outbox.delivered`.
2. Verify OTP login, magic-link one-time use, and logout.
3. Verify Telegram login creates a Telegram-only user.
4. From an email user's profile, link an unused Telegram identity.
5. Confirm both email and Telegram then open the same user account.
6. Confirm linking a Telegram identity already owned by another user returns a
   conflict and never merges users.
7. Confirm a new non-referral user has no subscription, balance, invite history,
   or payouts.

## Update procedure

```bash
systemctl stop pulsar-web pulsar-worker
sqlite3 /opt/pulsar2/data/pulsar.db ".backup '/var/backups/pulsar/pre-update.db'"
cd /opt/pulsar2
sudo -u pulsar npm ci
sudo -u pulsar bash -lc 'cd /opt/pulsar2; set -a; source /etc/pulsar/pulsar.env; set +a; npm run db:migrate'
sudo -u pulsar bash -lc 'cd /opt/pulsar2; set -a; source /etc/pulsar/pulsar.env; set +a; npm run build'
systemctl start pulsar-web pulsar-worker
systemctl --no-pager --full status pulsar-web pulsar-worker
```

For a failed deployment, restore code and the matching database backup together.
Do not run `prisma migrate resolve --applied` to conceal a failed migration.
