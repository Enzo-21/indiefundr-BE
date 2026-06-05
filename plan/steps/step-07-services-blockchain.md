# Step 07 — Services: blockchain

## Goal

Port Tron and purchase-order processing services (no cron wiring yet).

## Prerequisites

- [Step 01](step-01-prisma-schema.md) — `PurchaseOrder`, `FeeSponsorship`
- [Step 06](step-06-api-funds-investments.md) — subscribe creates orders

## Tasks

- [ ] Port [`services/tronClient.js`](../../backend-legacy/services/tronClient.js) → `src/services/tron/client.ts`
- [ ] Port [`services/feeSponsorship.js`](../../backend-legacy/services/feeSponsorship.js) → `src/services/tron/feeSponsorship.ts`
- [ ] Port [`services/purchaseOrderProcessor.js`](../../backend-legacy/services/purchaseOrderProcessor.js) → `src/services/orders/purchaseOrderProcessor.ts`
- [ ] Use Prisma for order step updates (not Mongoose)
- [ ] Env: `TRONGRID_API_KEY`, hot wallet keys, network (mainnet/shasta)
- [ ] Export `processPendingPurchaseOrders()` for step 09 cron

## Files to create

| File | Purpose |
|------|---------|
| `src/services/tron/client.ts` | TronWeb wrapper |
| `src/services/tron/feeSponsorship.ts` | TRX sponsorship |
| `src/services/orders/purchaseOrderProcessor.ts` | Step machine |

## Verification

- [ ] On testnet/shasta: process one pending order end-to-end in dev
- [ ] Failed orders create `FailedInvestment` record per legacy
- [ ] Idempotent retries on same order id

## Reference (legacy)

- [`backend-legacy/services/purchaseOrderProcessor.js`](../../backend-legacy/services/purchaseOrderProcessor.js)
- [`backend-legacy/models/PurchaseOrder.js`](../../backend-legacy/models/PurchaseOrder.js)

## Out of scope

- Cron invocation (step 09)
- Revenue ledger on subscribe (step 08 — wire hook after processor completes)
