# IndieFundr API (Next.js)

Production backend for IndieFundr, migrated from [`backend-legacy`](../backend-legacy/). See [ARCHITECTURE.md](ARCHITECTURE.md), the revenue engine spec in [specs/revenue-engine/README.md](specs/revenue-engine/README.md), and the migration playbook in [plan/README.md](plan/README.md).

## Getting started

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL (same MongoDB Atlas URI as legacy MONGO_URI)

npm install
npm run prisma:generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Health check: `GET /api/health` → `API Running Correctly`.

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

### Manual operations (no cron)

There is **no** background cron in dev or production. Ledger updates run on explicit admin actions (mark order successful, pay, confirm on-chain), not on a timer.

- **Mark order successful** — subscribe inflow + surplus credit + payout unlock scan
- **Investments page** — marks overdue investments matured on load
- **Pay now / Pay with surplus** — broadcast payout from treasury
- **Confirm payout on-chain** — ledger outflow when chain confirms
- **Reconcile treasury** — optional drift repair (treasury page)
- **Sync treasury history** — on-chain history ingest (treasury page)

User wallet reads only run **inbound USDT sync** (`syncWallet`); they do not auto-complete manual purchase orders.

If you still see `[cron]` logs, an old `dev-cron-ticker` process may be running—stop all Node dev processes and run `npm run dev` again (only `next dev` should start).

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
