# Pulsar 2.0

Pulsar 2.0 contains the preserved Next.js App Router frontend and a minimal
production backend foundation for email passwordless authentication.

## What is available

- User routes: `/`, `/auth/verify`, `/home`, `/subscription`, `/referrals`,
  `/profile`, `/support`, and `/legal`.
- The original responsive layout, navigation, shadcn/Base UI components,
  forms, dialogs, drawers, styles, animations, and public assets.
- Read-only fixtures under `src/frontend-preview` for visual review.

Email authentication is live through Server Actions. Other commercial-service
screens remain read-only previews until their application services are rebuilt.

## Local development

```bash
npm ci
npm run db:migrate
npm run dev
```

Run the email outbox worker in a separate process:

```bash
npm run worker
```

Copy `.env.example` to `.env`, replace every secret, and verify the Resend sender
domain before requesting a real login email. Never reuse the example values.

## Checks

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
```

See [Backend reset report](docs/BACKEND_RESET_REPORT.md) and
[New backend starting point](docs/NEW_BACKEND_STARTING_POINT.md). Historical
backend documents are retained in `docs/archive/old-backend` and are explicitly
marked as archived.

The authentication architecture and operations guide is in
[Auth backend foundation](docs/AUTH_BACKEND.md).

The VPS/operator handoff is in [VPS deployment](docs/VPS_DEPLOYMENT.md).
