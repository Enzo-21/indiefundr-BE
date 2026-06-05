# Migration playbook: backend-legacy → backend (Next.js)

Incremental migration from the Express app in [`backend-legacy/`](../backend-legacy/) to the Next.js production API in [`backend/`](../backend/).

**Do not migrate everything at once.** Complete one step, verify, then move to the next.

---

## How to use this with AI

1. Open the step file for the crumb you want (e.g. [`steps/step-01-prisma-schema.md`](steps/step-01-prisma-schema.md)).
2. Prompt: **"Apply step 01 from backend/plan. Do not skip prerequisites. Do not edit the plan files."**
3. Update the [status table](#step-status) when the step is done.
4. Run that step's **Verification** section before continuing.

Rules:

- **One step per session** when possible.
- **Prisma first** (step 01) before services that touch the database.
- **Do not change** [`frontend/`](../frontend/) unless a step explicitly says so.
- **Do not delete** `backend-legacy/` until step 13.

---

## Step status

| Step | Name | Status |
|------|------|--------|
| [00](steps/step-00-foundation.md) | Foundation (deps, folders, health) | Done |
| [01](steps/step-01-prisma-schema.md) | Prisma schema (Mongoose → Prisma) | Done |
| [02](steps/step-02-src-lib.md) | `src/lib` config and constants | Done |
| [03](steps/step-03-auth-and-middleware.md) | Auth services and token verification | Done |
| [04](steps/step-04-api-auth-users.md) | API: auth + users | Done |
| [05](steps/step-05-api-wallets.md) | API: wallets | Done |
| [06](steps/step-06-api-funds-investments.md) | API: funds + investments | Done |
| [07](steps/step-07-services-blockchain.md) | Services: Tron + purchase orders | Done |
| [08](steps/step-08-revenue-engine.md) | Revenue engine | Done |
| [09](steps/step-09-background-jobs.md) | Background jobs (cron) | Done |
| [10](steps/step-10-realtime-polling.md) | Realtime (HTTP polling) | Done |
| [11](steps/step-11-admin-api.md) | Admin treasury API | Done |
| [12](steps/step-12-server-actions-admin.md) | Server Actions (admin UI) | Done |
| [13](steps/step-13-cutover.md) | Cutover and decommission legacy | Done |

---

## Target structure (summary)

See [ARCHITECTURE.md](../ARCHITECTURE.md) and [CONVENTIONS.md](../CONVENTIONS.md).

- `prisma/schema.prisma` — database
- `src/lib/` — config, env, Prisma, auth helpers
- `src/services/` — business logic
- `src/actions/` — admin Server Actions only
- `app/api/**/route.ts` — REST parity with Express

---

## API parity matrix

Paths must match legacy mounts in [`backend-legacy/server.js`](../backend-legacy/server.js). **Priority:** P0 = invest flow; P1 = auth/wallets; P2 = unused or admin-only.

### Health

| Method | Legacy path | Next route file | Frontend | P |
|--------|-------------|-----------------|----------|---|
| GET | `/` | `app/page.tsx` or `app/api/health/route.ts` | — | P1 |

### Auth (`/api/auth`)

| Method | Legacy path | Next route file | Frontend | P |
|--------|-------------|-----------------|----------|---|
| GET | `/api/auth` | `app/api/auth/route.ts` | `authActions` load user | P1 |
| POST | `/api/auth/start` | `app/api/auth/start/route.ts` | login | P1 |
| POST | `/api/auth/verify` | `app/api/auth/verify/route.ts` | login | P1 |
| POST | `/api/auth/resend` | `app/api/auth/resend/route.ts` | login | P1 |
| POST | `/api/auth/refresh` | `app/api/auth/refresh/route.ts` | `apiClient` | P1 |
| POST | `/api/auth/logout` | `app/api/auth/logout/route.ts` | logout | P1 |

### Users (`/api/users`)

| Method | Legacy path | Next route file | Frontend | P |
|--------|-------------|-----------------|----------|---|
| GET | `/api/users` | `app/api/users/route.ts` | — | P2 |
| GET | `/api/users/user/:id` | `app/api/users/user/[id]/route.ts` | `loadUser` | P1 |
| GET | `/api/users/user/get/:email` | `app/api/users/user/get/[email]/route.ts` | — | P2 |
| PUT | `/api/users/update-username` | `app/api/users/update-username/route.ts` | — | P2 |
| PUT | `/api/users/welcome` | `app/api/users/welcome/route.ts` | `FirstTime` | P1 |
| POST | `/api/users/notifications/token` | `app/api/users/notifications/token/route.ts` | push | P1 |
| DELETE | `/api/users/notifications/token` | `app/api/users/notifications/token/route.ts` | push | P1 |

### Wallets (`/api/wallets`)

| Method | Legacy path | Next route file | Frontend | P |
|--------|-------------|-----------------|----------|---|
| GET | `/api/wallets` | `app/api/wallets/route.ts` | — | P2 |
| POST | `/api/wallets/generate` | `app/api/wallets/generate/route.ts` | wallets | P1 |
| GET | `/api/wallets/user` | `app/api/wallets/user/route.ts` | wallets | P1 |
| GET | `/api/wallets/balance` | `app/api/wallets/balance/route.ts` | wallets | P1 |
| GET | `/api/wallets/portfolio` | `app/api/wallets/portfolio/route.ts` | home/portfolio | P0 |
| GET | `/api/wallets/:walletId` | `app/api/wallets/[walletId]/route.ts` | wallets | P1 |
| GET | `/api/wallets/:walletId/transactions` | `app/api/wallets/[walletId]/transactions/route.ts` | activity | P1 |
| PATCH | `/api/wallets/:walletId/main` | `app/api/wallets/[walletId]/main/route.ts` | wallets | P1 |
| POST | `/api/wallets/addCustomWallet` | `app/api/wallets/addCustomWallet/route.ts` | import wallet | P1 |

### Funds (`/api/funds`)

| Method | Legacy path | Next route file | Frontend | P |
|--------|-------------|-----------------|----------|---|
| GET | `/api/funds` | `app/api/funds/route.ts` | fund catalog | P0 |
| GET | `/api/funds/estimate` | `app/api/funds/estimate/route.ts` | subscribe | P0 |
| POST | `/api/funds/subscribe` | `app/api/funds/subscribe/route.ts` | subscribe | P0 |
| GET | `/api/funds/orders/current` | `app/api/funds/orders/current/route.ts` | optional | P0 |
| GET | `/api/funds/orders/:orderId` | `app/api/funds/orders/[orderId]/route.ts` | optional | P0 |

### Investments (`/api/investments`)

| Method | Legacy path | Next route file | Frontend | P |
|--------|-------------|-----------------|----------|---|
| GET | `/api/investments` | `app/api/investments/route.ts` | portfolio | P0 |
| POST | `/api/investments/:id/redeem` | `app/api/investments/[id]/redeem/route.ts` | claim | P0 |

### Admin (`/api/admin/treasury`)

| Method | Legacy path | Next route file | Frontend | P |
|--------|-------------|-----------------|----------|---|
| GET | `/api/admin/treasury/ledger` | `app/api/admin/treasury/ledger/route.ts` | admin app | P2 |
| GET | `/api/admin/treasury/queue` | `app/api/admin/treasury/queue/route.ts` | admin app | P2 |
| GET | `/api/admin/treasury/events` | `app/api/admin/treasury/events/route.ts` | admin app | P2 |
| POST | `/api/admin/treasury/withdrawals` | `app/api/admin/treasury/withdrawals/route.ts` | admin app | P2 |

### Profile / photos (legacy only — not used by Expo today)

| Method | Legacy path | Next route file | P |
|--------|-------------|-----------------|---|
| * | `/api/profile/*` | `app/api/profile/...` | P2 |
| * | `/api/profilephotos/*` | `app/api/profilephotos/...` | P2 |

### Realtime (not REST)

| Mechanism | Legacy | Next (step 10) | Frontend |
|-----------|--------|----------------|----------|
| HTTP polling | Socket.io (legacy) | Poll order/investment routes (step 10) | Subscribe + portfolio screens |

---

## Suggested order

```
00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13
```

Steps 07–08 can overlap 05–06 if Prisma repositories exist. Step 09 depends on 07–08. Step 10 replaces legacy Socket.io with polling (backend routes + Expo); required for full UX on Vercel.

---

## Environment variables

Full matrix and sign-off: **[CUTOVER.md](CUTOVER.md)** § B.

| Variable | Where | Purpose |
|----------|-------|---------|
| `EXPO_PUBLIC_API_URL` | Expo | Next backend URL (staging/prod) |
| `EXPO_PUBLIC_BLOCKCHAIN_NETWORK` | Expo | Must match backend `BLOCKCHAIN_NETWORK` |
| `DATABASE_URL` | backend | Prisma MongoDB (same Atlas as legacy) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | backend | User auth tokens |
| `ADMIN_API_KEY` | backend | Admin REST + `/admin/login` |
| `CRON_SECRET` | backend + Vercel | `/api/cron/investments` |
| `TREASURY_ADDRESS`, `TREASURY_PRIVATE_KEY` | backend | On-chain flows |
| `TRON_API_KEY`, `BLOCKCHAIN_NETWORK` | backend | TronGrid |
| `RESEND_API_KEY`, `MAILING_DOMAIN` | backend | OTP email |

Copy from [`backend/.env.example`](../.env.example). Legacy reference: [`backend-legacy/.env.example`](../../backend-legacy/.env.example).

## Parity exceptions (P2)

Not ported — **not used by Expo** today: `GET /api/users`, `GET /api/users/user/get/:email`, `PUT /api/users/update-username`, `GET /api/wallets`, `/api/profile/*`, `/api/profilephotos/*`. Documented in [CUTOVER.md](CUTOVER.md).

---

## References

- Legacy architecture: [`backend-legacy/docs/BACKEND_ARCHITECTURE.md`](../backend-legacy/docs/BACKEND_ARCHITECTURE.md)
- Revenue engine spec: [`specs/revenue-engine/README.md`](../specs/revenue-engine/README.md)
