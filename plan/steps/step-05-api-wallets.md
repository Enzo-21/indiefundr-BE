# Step 05 — API: wallets

## Goal

Port all `/api/wallets/*` routes used by the Expo app. Preserve **route order**: static segments before `[walletId]`.

## Prerequisites

- [Step 01](step-01-prisma-schema.md) — `Wallet` model
- [Step 03](step-03-auth-and-middleware.md)
- [Step 04](step-04-api-auth-users.md) — users can authenticate

## Tasks

- [ ] Port [`controllers/web3controller.js`](../../backend-legacy/controllers/web3controller.js) logic into `src/services/wallets/`
- [ ] Port [`services/walletBalance.js`](../../backend-legacy/services/walletBalance.js)
- [ ] Port [`services/investmentPortfolio.js`](../../backend-legacy/services/investmentPortfolio.js)
- [ ] Implement routes (static first):
  - [ ] `GET app/api/wallets/portfolio/route.ts`
  - [ ] `GET app/api/wallets/user/route.ts`
  - [ ] `GET app/api/wallets/balance/route.ts`
  - [ ] `POST app/api/wallets/generate/route.ts`
  - [ ] `POST app/api/wallets/addCustomWallet/route.ts`
  - [ ] `GET app/api/wallets/[walletId]/route.ts`
  - [ ] `GET app/api/wallets/[walletId]/transactions/route.ts`
  - [ ] `PATCH app/api/wallets/[walletId]/main/route.ts`
- [ ] Never log private keys; encrypt at rest same as legacy
- [ ] All routes require `verifyAccessToken`

## Files to create

| File | Purpose |
|------|---------|
| `src/services/wallets/*.ts` | Business logic |
| `app/api/wallets/**/route.ts` | HTTP layer |

## Verification

- [ ] Generate wallet returns address + id
- [ ] Portfolio returns holdings summary for logged-in user
- [ ] Balance reflects on-chain or cached balance per legacy behavior
- [ ] Set main wallet updates `isMain` flags

## Reference (legacy)

- [`backend-legacy/routes/api/web3.js`](../../backend-legacy/routes/api/web3.js) (mounted at `/api/wallets`)
- [`frontend/redux`](../../frontend/redux) — wallet slices

## Out of scope

- Full Tron client (step 07) — may stub balance if needed, document dependency
- Funds subscribe (step 06)
