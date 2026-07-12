# Pulsar 2.0 authentication backend

## Scope

This foundation implements email passwordless authentication and Telegram OIDC
login/linking without changing the visual contract of the login page. It does not
restore billing, provisioning, referrals, support persistence, or a Telegram
login transport.

The layers are:

- `src/server/domain`: provider/purpose vocabulary, request context, and safe
  application errors.
- `src/server/application`: challenge/session lifecycle and outbox processing.
- `src/server/infrastructure`: Prisma/SQLite, crypto, environment validation,
  JSON logging, Resend, and email rendering.
- `src/server/transport/next`: cookies, request context, and the authenticated
  data-access boundary used by Next.js.
- `app/(auth)/actions.ts` and `app/auth/verify/link/route.ts`: thin public
  transports. They validate/translate results but contain no auth policy.

Next.js 16.2 uses `proxy.ts` for the feature formerly named Middleware. Pulsar's
proxy only adds a correlation ID and performs an optimistic cookie-presence
guard. Database-backed session verification remains in the DAL, close to data.

## Persistence and migration

Migration `20260712143000_auth_foundation` creates:

- `User` and provider-neutral `AuthIdentity`;
- `LoginChallenge` for email now and verified Telegram identities later;
- hash-only `Session` records;
- `AuditLog`, encrypted `OutboxEvent`, and persistent `RateLimitBucket`.

Foreign keys and database CHECK constraints protect provider, purpose, state,
attempt, and outcome values. Runtime initialization enables WAL,
`foreign_keys=ON`, a 5-second busy timeout, and `synchronous=NORMAL` on every
Prisma process. The Prisma Client is a development-safe singleton.

Use a new empty database for this reset backend. The old root `pulsar.db` may
contain the archived schema and is not a migration baseline. The recommended
path is `file:./data/pulsar.db`.

```bash
npm ci
npm run db:generate
npm run db:migrate
```

`db:migrate` first creates the SQLite parent directory/file because Prisma
Migrate 7 on Windows expects the target file to exist, then applies migrations.

## Required environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite URL, recommended `file:./data/pulsar.db` |
| `NEXT_PUBLIC_APP_URL` | Canonical origin used in magic links |
| `AUTH_TOKEN_SECRET` | At least 32 random characters; HMAC key for credentials and limiter keys |
| `OUTBOX_ENCRYPTION_KEY` | Base64-encoded 32-byte AES key |
| `RESEND_API_KEY` | Resend API key, only read by the worker |
| `EMAIL_FROM` | Friendly sender on a verified domain |

Operational defaults are documented in `.env.example`: OTP and magic link are
10 minutes, session is 180 days, challenge max attempts is 5, and email/IP
request rate limits use a 15-minute fixed window. `SESSION_COOKIE_NAME` defaults
to `pulsar_session`. Successful email requests also start a persistent
60-second resend cooldown (`AUTH_RESEND_COOLDOWN_SECONDS`).

Telegram uses Authorization Code Flow with PKCE, state, nonce, exact redirect
URI matching, RS256/JWKS signature validation, and issuer/audience/expiration
checks. There is no unsigned Telegram identity path and OIDC login does not
require a Bot API webhook or bot token.

Identity linking never merges two existing users. A verified email or Telegram
identity may be attached only when it is not already owned by another `User`.
If it is already registered, linking fails with `IDENTITY_ALREADY_LINKED`; user
records, balances, subscriptions, and histories are never transferred or
combined. The database unique constraint on `(provider, providerSubject)` is the
final enforcement boundary for this rule.

## Security lifecycle

Requesting a login atomically consumes persistent rate-limit capacity,
supersedes earlier active email challenges, stores HMAC hashes for OTP/magic
credentials, records an audit entry, and writes an AES-256-GCM encrypted email
payload to the outbox. Resend is never called from this transaction.

OTP or magic-link verification atomically consumes exactly one challenge,
creates/finds the user identity, and creates a 256-bit random session. Only the
session HMAC is stored. The raw session exists only long enough for the transport
to set an `HttpOnly`, `SameSite=Lax`, production-`Secure` cookie. Logout hashes
the presented cookie and revokes only that database session.

The worker claims events with a compare-and-update, retries with exponential
backoff, reclaims stale locks, passes a stable Resend idempotency key, and never
sends a message after its challenge expires. Logs contain IDs/codes, not tokens,
emails, provider payloads, or raw exceptions.

## Processes and checks

Development:

```bash
npm run dev
npm run worker
```

Production after build/migration, in two supervised processes:

```bash
npm run start
npm run worker
```

Run verification with:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev
```

## File map

- `prisma/schema.prisma`, `prisma.config.ts`, `prisma/migrations/**`: schema and
  deployable migration.
- `scripts/prepare-database.ts`: safe SQLite file bootstrap before migration.
- `src/server/application/auth/*`: all challenge, identity, session, rate-limit,
  audit, and logout policy.
- `src/server/application/outbox/*`, `src/server/worker.ts`: durable email worker.
- `src/server/infrastructure/config/*`, `crypto/*`, `database/*`,
  `observability/*`: validated runtime foundation.
- `src/server/infrastructure/email/*`: Resend adapter and Pulsar-styled multipart
  login email.
- `src/server/transport/next/*`, `app/(auth)/actions.ts`,
  `app/auth/verify/link/route.ts`, `proxy.ts`: Next.js transport and guards.
- `components/auth/auth-card.tsx`, `components/auth/logout-action.tsx`, dashboard
  layout/profile: existing UI wired to the backend without embedded policy.
- `tests/*`: crypto, migration constraints, SQLite runtime, auth races/expiry/
  reuse/rate limits, outbox retry/deduplication, and frontend boundary coverage.

## Remaining operational risks

- SQLite is appropriate for a single VPS with local durable storage. Do not put
  the database on NFS and do not horizontally scale web hosts without changing
  the persistence design.
- Backups and restore drills for the database, WAL, and encryption keys are an
  operational responsibility not implemented in this auth-only change.
- Resend requires its SPF/DKIM records on the sending subdomain. A verified
  `EMAIL_FROM` must exist before production traffic.
- Rotating `AUTH_TOKEN_SECRET` invalidates active challenges and sessions.
  Rotating `OUTBOX_ENCRYPTION_KEY` requires draining or re-encrypting pending
  outbox events first.
- Resend idempotency keys expire after 24 hours. Local outbox state prevents
  ordinary duplicates, but a crash after provider acceptance followed by more
  than 24 hours of downtime can still produce a stale duplicate attempt.
- Telegram transport must validate Telegram's signed payload and freshness
  before creating a verified identity challenge; no implementation exists yet.
