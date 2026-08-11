# JustLend Energy Rent — ops setup

Use this checklist after deploying fee sponsorship (free resources → JustLend → TRX fallback).

## 1. Network

- Production must run `BLOCKCHAIN_NETWORK=mainnet`.
- JustLend Energy Rental is Mainnet-only; on testnet the orchestrator skips rent and uses free resources → TRX top-up.

## 2. Treasury float

- Same hot wallet as today: `TREASURY_ADDRESS` + `TREASURY_PRIVATE_KEY`.
- Keep enough TRX for concurrent JustLend prepays (minimum ~20 TRX liquidation reserve **per open rental**, plus rent). Unused prepay is refunded on `returnResource`.
- Keep a separate buffer for the TRX top-up fallback path.

## 3. JustLend config (code constants)

JustLend settings live in [`src/lib/config/justlend.ts`](../src/lib/config/justlend.ts) (not env):

- `JUSTLEND_ENERGY_RENT_ENABLED` — set `false` in that file to force TRX top-up fallback
- rental contract address, OpenAPI base, duration, prepay buffer, wait timeouts

No JustLend env vars are required. Availability still needs mainnet + treasury private key.

## 4. Wallet activation

JustLend rejects unactivated receivers. Keep `WALLET_ACTIVATION_ENABLED=true` so new user wallets are activated before sponsorship.

## 5. Smoke tests (admin)

1. Wallet with enough Energy/Bandwidth → Complete order first step shows **user resources / free transfer**.
2. Wallet without Energy → first step rents via JustLend (`energyRentTxId`), USDT succeeds, recover step returns rental (`energyReturnTxId`).
3. `JUSTLEND_ENERGY_RENT_ENABLED=false` in `justlend.ts` → first step uses **TRX top-up fallback**, then recover sweeps residual TRX.

## 6. Monitoring

- Open rentals: JustLend OpenAPI `/lend/rentResource/account?addresses=<TREASURY_ADDRESS>` or contract `getRentInfo`.
- Alert if `energyRentTxId` exists without `energyReturnTxId` after order completion (liquidation risk on short rentals).
- UI for market inspection only: https://app.justlend.org/energy (backend does not use wallet-connect).
