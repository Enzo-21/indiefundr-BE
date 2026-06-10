# IndieFundr API (Next.js)

Production backend for IndieFundr, migrated from [`backend-legacy`](../backend-legacy/). See [ARCHITECTURE.md](ARCHITECTURE.md), the revenue engine spec in [specs/revenue-engine/README.md](specs/revenue-engine/README.md), and the migration playbook in [plan/README.md](plan/README.md).

## Getting started

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL (MongoDB Atlas connection string)

npm install
npm run prisma:generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the marketing landing, admin, and API. Health check: `GET /api/health` → `API Running Correctly`.

**Phone on the same Wi‑Fi:** use the Network URL Next prints (e.g. `http://192.168.x.x:3000`). Dev mode allows LAN IPv4 origins automatically (`allowedDevOrigins` in `next.config.ts`); no manual IP edits when DHCP changes.

### Marketing landing + Expo web app

The landing page lives at `/` on the Next.js server. The React Native app (Expo) is linked separately — it is not embedded in this repo’s backend.

```bash
# Terminal 1 — API, admin, and marketing landing
cd backend && npm run dev          # http://localhost:3000

# Terminal 2 — Expo web (the “app”)
cd frontend && npm run web         # http://localhost:8081
```

Configure in `backend/.env`:

- `APP_WEB_URL=http://localhost:8081` — where middleware redirects the app subdomain (Expo web in dev).
- `MARKETING_DOMAIN=localhost:3000` — apex host used to detect `app.{domain}` in production.

**Development:** On `localhost`, landing CTAs use `http://app.localhost:3000` (middleware → `APP_WEB_URL`). On a LAN IP (e.g. phone on `http://192.168.x.x:3000`), CTAs use `http://192.168.x.x:3000/__open-app`, which redirects to Expo on the same IP (`http://192.168.x.x:8081` by default). You can also open `http://localhost:8081` directly.

**Production:** Set `APP_WEB_URL=https://app.yourdomain.com` and `MARKETING_DOMAIN=yourdomain.com`. Build with `cd frontend && npm run build:web`, deploy `frontend/dist/` to the `app` subdomain; DNS apex points at this Next.js host.

**Mobile web:** Phones visiting `app.{domain}` see native install instructions (TestFlight on iOS, APK on Android). Desktop browsers use the full web app. Store badges on the landing page open the same flows in a modal. See [docs/NATIVE_MOBILE_DISTRIBUTION.md](docs/NATIVE_MOBILE_DISTRIBUTION.md).

## Database (Prisma)

Schema: [`src/prisma/schema.prisma`](src/prisma/schema.prisma). Prisma client: [`src/lib/prisma.ts`](src/lib/prisma.ts).

1. Set `DATABASE_URL` in `.env` (MongoDB connection string).
2. `npm run prisma:generate` — generate the Prisma client.
3. `npm run db:push` — apply schema to **dev/staging** Atlas only (review before production).
4. `npm run db:indexes` — create partial unique and TTL indexes Prisma cannot declare.
5. `npm run db:seed` — create the global treasury ledger row with zeros if it does not exist (never overwrites existing data).
6. `npm run db:verify` — read-only connectivity check (`findMany` samples).

If the internal ledger still shows stale pool/protected values from an old bootstrap, delete the `treasuryledgers` document with `_id: "global"` in MongoDB once, then run `npm run db:seed` again.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run prisma:generate` | Regenerate Prisma client after schema changes |
| `npm run db:push` | Push schema to MongoDB |
| `npm run db:indexes` | Ensure partial/TTL indexes |
| `npm run db:seed` | Create empty global treasury ledger if missing |
| `npm run db:verify` | Read-only Prisma connectivity check |
| `npm test` | Node test runner (does not write to MongoDB) |
| `npm run cutover:smoke` | Pre-cutover API smoke test (needs running server) |

### Wallet provisioning

If a user has no wallet row (e.g. deleted in the database), the API recreates a default main wallet on login (`verify` OTP) and when loading `GET /api/wallets/portfolio`.

### Wallet activation (TRON)

New users receive a main wallet at signup. **By default** `WALLET_ACTIVATION_ENABLED=false`: the treasury does **not** send signup TRX; addresses are activated lazily when the user invests (fee-sponsorship TRX top-up). Set `WALLET_ACTIVATION_ENABLED=true` to restore signup activation: treasury sends `WALLET_ACTIVATION_TRX` TRX (default **0.1**) so TronLink and USDT deposits work without the user funding TRX first. Use `1` in env if a network requires more. When enabled, activation runs in the background (non-blocking); `GET /api/wallets/portfolio` polls on-chain status and returns `activationStatus` (`ready` | `pending` | `failed`) until Tron confirms. Guardrails: `MAX_WALLET_ACTIVATIONS_PER_DAY`, `WALLET_ACTIVATION_CONFIRM_TIMEOUT_MS` (default 90s), treasury above `TREASURY_MIN_TRX_BALANCE` + activation amount. Fund the treasury wallet (Shasta faucet for testnet).

### Background jobs

**Maturity cron (Vercel):** [`vercel.json`](vercel.json) schedules `GET /api/cron/maturity` every minute (`* * * * *`). Each tick matures at most **5** overdue investments (FIFO by `maturesAt`), processes up to **5** forfeitures (expired 48h choice deadlines, expired recovery windows), then sends push notifications when `User.device` is set. The JSON response includes `pendingCount`, `forfeitedCount`, and `forfeiturePendingCount`. Set `CRON_SECRET` in Vercel env; Vercel sends `x-vercel-cron: 1` on scheduled invocations. One-minute cron requires a Vercel Pro (or higher) plan.

**Unpaid maturity choice:** Users have **48 hours** (`UNPAID_MATURITY_CHOICE_HOURS`, default 48) after first unpaid maturity to choose recover vs wait, or the investment is `forfeited`. Second unpaid maturity after a term extension also forfeits immediately.

Local manual run (with `npm run dev` running):

```bash
npm run cron:maturity
```

**Full investment pipeline** (`GET /api/cron/investments` — purchase orders, maturity, evaluate, redemptions) is **not** on the Vercel schedule; trigger manually with Bearer auth when needed.

### Manual admin operations

Ledger payout updates still run on explicit admin actions, not on the maturity cron timer:

- **Mark order successful** — subscribe inflow + surplus credit + payout unlock scan
- **Pay now / Pay with surplus** — broadcast payout from treasury
- **Confirm payout on-chain** — ledger outflow when chain confirms
- **Reconcile treasury** — optional drift repair (treasury page)
- **Sync treasury history** — on-chain history ingest (treasury page)

`GET /api/investments` also calls `markMaturedInvestments()` on load without a batch limit (idempotent with the cron; processes all overdue rows for that request).

User wallet reads only run **inbound USDT sync** (`syncWallet`); they do not auto-complete manual purchase orders.

See [plan/MANUAL_INVESTMENT_MVP.md](plan/MANUAL_INVESTMENT_MVP.md).

### Troubleshooting dev builds

If Turbopack reports stale compile errors (e.g. duplicate symbols in a file you already fixed), clear the cache and restart:

```bash
rm -rf .next && npm run dev
```

## Production cutover

Migration from Express ([`backend-legacy/`](../backend-legacy/)) is complete in code. Use **[plan/CUTOVER.md](plan/CUTOVER.md)** for staging/production sign-off.

1. Deploy this app (e.g. Vercel) with env vars from [`.env.example`](.env.example).
2. Point Expo `EXPO_PUBLIC_API_URL` at the deployed host.
4. Run `npm run cutover:smoke` against staging/production `BASE_URL`.
5. Keep `backend-legacy` available for rollback until [CUTOVER.md § H](plan/CUTOVER.md) is signed off.

**Rollback:** Revert Expo API URL to legacy host (port 4000), restart legacy Express. Details in CUTOVER.md § G.

## Project layout

```
backend/
├── src/
│   ├── app/          # App Router (API routes)
│   ├── lib/          # Prisma, config, auth helpers
│   ├── services/     # Business logic (migration in progress)
│   ├── actions/      # Admin Server Actions
│   └── prisma/       # schema.prisma
├── specs/            # Business specs (e.g. revenue engine)
├── scripts/          # DB maintenance scripts
└── plan/             # Migration steps
```
