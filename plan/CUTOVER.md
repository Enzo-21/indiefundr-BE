# Cutover checklist — backend-legacy → backend (Next.js)

**Migration target:** [`backend/`](../) (Next.js App Router)  
**Rollback source:** [`backend-legacy/`](../../backend-legacy/) (Express, port 4000)  
**Last updated:** 2026-05-24

Use this document for staging/production sign-off. Automated checks: `npm run cutover:smoke` (see [backend README](../README.md)).

---

## A. Pre-flip (local / CI)

| # | Task | Owner | Date | Pass |
|---|------|-------|------|------|
| A1 | `cd backend && npm test` — all pass | | | |
| A2 | `cd backend && npm run build` — success | | | |
| A3 | `npm run dev` then `npm run cutover:smoke` against `http://localhost:3000` | | | |
| A4 | Manual Expo: auth (start → verify → refresh → logout) | | | |
| A5 | Manual Expo: wallets (generate, portfolio, balance, set main) | | | |
| A6 | Manual Expo: invest (catalog → estimate → subscribe → **poll** order) | | | |
| A7 | Manual Expo: holdings (list, redeem when payable) | | | |
| A8 | Manual Expo: push token register / delete | | | |
| A9 | Admin REST: `curl -H "x-admin-api-key: $ADMIN_API_KEY" …/api/admin/treasury/ledger` | | | |
| A10 | Admin UI: `/admin/login` → `/admin/treasury` | | | |

**Realtime note:** Legacy Socket.io was removed in step 10. Verify **HTTP polling** (2.5s) updates order status on a physical device — not socket events.

---

## B. Environment matrix

Set the same logical values in staging and production; only hosts/secrets differ.

| Variable | Component | Required | Purpose |
|----------|-----------|----------|---------|
| `EXPO_PUBLIC_API_URL` | Expo | Yes | Next backend base URL (staging/prod host). Local: `auto` or `http://<lan-ip>:3000` |
| `EXPO_PUBLIC_BLOCKCHAIN_NETWORK` | Expo | Yes | `testnet` or `mainnet` — must match backend `BLOCKCHAIN_NETWORK` |
| `DATABASE_URL` | backend | Yes | Prisma MongoDB connection (same Atlas DB as legacy `MONGO_URI`) |
| `MONGO_URI` | backend | Optional | Legacy alias; `DATABASE_URL` preferred |
| `JWT_ACCESS_SECRET` | backend | Yes | Access token signing (`x-auth-token`) |
| `JWT_REFRESH_SECRET` | backend | Yes | Refresh token sessions |
| `JWT_SECRET` | backend | Optional | Legacy alias for access secret |
| `ADMIN_API_KEY` | backend | Yes (admin) | REST `/api/admin/treasury/*` and admin UI login |
| `CRON_SECRET` | backend + Vercel | Yes (prod) | Bearer auth for `GET /api/cron/investments` |
| `TREASURY_ADDRESS` | backend | Yes (on-chain) | Receives subscribe USDT |
| `TREASURY_PRIVATE_KEY` | backend | Yes (on-chain) | Signs treasury transfers |
| `TRON_API_KEY` | backend | Recommended | TronGrid rate limits |
| `BLOCKCHAIN_NETWORK` | backend | Yes | `testnet` or `mainnet` |
| `RESEND_API_KEY` | backend | Yes (auth) | OTP email |
| `MAILING_DOMAIN` | backend | Yes (auth) | Resend verified domain |
| `REVENUE_ENGINE_ENABLED` | backend | Optional | Default on; set `false` to disable engine |
| `PURCHASE_ORDER_PROCESSOR_ENABLED` | backend | Optional | Default on |
| `PORT` | backend | Local | Next default `3000` (legacy used `4000`) |
| *(none)* | Expo | — | No socket URL; polling only (step 10) |

**Vercel:** Configure env vars in project settings; cron schedule in [`vercel.json`](../vercel.json) (`* * * * *` → `/api/cron/investments`).

---

## C. API parity sign-off (Expo-used routes)

P0/P1 routes implemented in Next. **Smoke** = `npm run cutover:smoke`. **Manual QA** = Expo or curl during staging.

### Health

| Method | Path | Implemented | Smoke | Manual QA |
|--------|------|-------------|-------|-----------|
| GET | `/api/health` | Yes | | |

### Auth

| Method | Path | Implemented | Smoke | Manual QA |
|--------|------|-------------|-------|-----------|
| GET | `/api/auth` | Yes | | |
| POST | `/api/auth/start` | Yes | | |
| POST | `/api/auth/verify` | Yes | | |
| POST | `/api/auth/resend` | Yes | | |
| POST | `/api/auth/refresh` | Yes | | |
| POST | `/api/auth/logout` | Yes | | |

### Users

| Method | Path | Implemented | Smoke | Manual QA |
|--------|------|-------------|-------|-----------|
| GET | `/api/users/user/:id` | Yes | | |
| PUT | `/api/users/welcome` | Yes | | |
| POST | `/api/users/notifications/token` | Yes | | |
| DELETE | `/api/users/notifications/token` | Yes | | |

### Wallets

| Method | Path | Implemented | Smoke | Manual QA |
|--------|------|-------------|-------|-----------|
| POST | `/api/wallets/generate` | Yes | | |
| GET | `/api/wallets/user` | Yes | | |
| GET | `/api/wallets/balance` | Yes | | |
| GET | `/api/wallets/portfolio` | Yes | | |
| GET | `/api/wallets/:walletId` | Yes | | |
| GET | `/api/wallets/:walletId/transactions` | Yes | | |
| PATCH | `/api/wallets/:walletId/main` | Yes | | |
| POST | `/api/wallets/addCustomWallet` | Yes | | |

### Funds & investments

| Method | Path | Implemented | Smoke | Manual QA |
|--------|------|-------------|-------|-----------|
| GET | `/api/funds` | Yes | | |
| GET | `/api/funds/estimate` | Yes | | |
| POST | `/api/funds/subscribe` | Yes | | |
| GET | `/api/funds/orders/current` | Yes | | |
| GET | `/api/funds/orders/:orderId` | Yes | | |
| GET | `/api/investments` | Yes | | |
| POST | `/api/investments/:id/redeem` | Yes | | |

### Admin treasury

| Method | Path | Implemented | Smoke | Manual QA |
|--------|------|-------------|-------|-----------|
| GET | `/api/admin/treasury/ledger` | Yes | | |
| GET | `/api/admin/treasury/queue` | Yes | | |
| GET | `/api/admin/treasury/events` | Yes | | |
| POST | `/api/admin/treasury/withdrawals` | Yes | | |

### Accepted parity exceptions (P2 — not used by Expo)

Not ported to Next; no cutover blocker:

- `GET /api/users`
- `GET /api/users/user/get/:email`
- `PUT /api/users/update-username`
- `GET /api/wallets`
- `/api/profile/*`, `/api/profilephotos/*`

### Realtime

| Mechanism | Legacy | Next | Manual QA |
|-----------|--------|------|-----------|
| Order / investment updates | Socket.io | HTTP polling (2.5s) | Poll on device during subscribe/redeem |

---

## D. Staging flip (manual)

| # | Task | Owner | Date | Pass |
|---|------|-------|------|------|
| D1 | Deploy `backend/` to staging (Vercel or Node host) | | | |
| D2 | Set all env vars from section B on staging | | | |
| D3 | Confirm Vercel cron hits `/api/cron/investments` | | | |
| D4 | Staging Expo build: `EXPO_PUBLIC_API_URL` = staging Next URL | | | |
| D5 | 48h QA: full invest + claim flow on staging | | | |
| D6 | `npm run cutover:smoke` against staging `BASE_URL` | | | |

---

## E. Production flip (manual)

| # | Task | Owner | Date | Pass |
|---|------|-------|------|------|
| E1 | Production deploy of `backend/` | | | |
| E2 | Update `EXPO_PUBLIC_API_URL` / DNS / load balancer to production Next URL | | | |
| E3 | Disable legacy Express process and legacy in-process cron | | | |
| E4 | Keep legacy host **read-only** for one release cycle (rollback) | | | |
| E5 | Production smoke + one real subscribe/redeem smoke test | | | |

---

## F. Post-flip monitoring (48h – 2 weeks)

| # | Metric / check | Owner | Date | Pass |
|---|----------------|-------|------|------|
| F1 | 5xx rate vs legacy baseline (no material increase) | | | |
| F2 | Purchase orders not stuck in `queued`/`processing` beyond SLA | | | |
| F3 | Treasury pool / ledger sanity (admin ledger endpoint) | | | |
| F4 | Cron runs every minute; orders processed comparable to legacy | | | |
| F5 | Polling UX: order completes on device without socket | | | |

---

## G. Rollback plan

If critical regression after production flip:

1. **Revert Expo** `EXPO_PUBLIC_API_URL` to legacy host (port **4000**).
2. **Stop** Next Vercel cron (or remove cron trigger).
3. **Restart** legacy Express + legacy cron if applicable.
4. Investigate logs; fix forward on a branch; re-run staging checklist before re-flip.

---

## H. Decommission gate (later — not during initial cutover)

| # | Task | Owner | Date | Pass |
|---|------|-------|------|------|
| H1 | ≥ 2 weeks stable on Next with no rollback | | | |
| H2 | Archive or delete `backend-legacy/` (product approval) | | | |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering | | | |
| Product / Ops | | | |
