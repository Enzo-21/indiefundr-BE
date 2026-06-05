# Step 01 — Prisma schema

## Goal

Replace Mongoose with **Prisma** as the data layer. Define all models in `prisma/schema.prisma` (MongoDB provider) before porting services.

## Prerequisites

- [Step 00](step-00-foundation.md) complete (`prisma` package installed).

## Tasks

- [ ] Create `prisma/schema.prisma` with `provider = "mongodb"` and `url = env("DATABASE_URL")`
- [ ] Map models from legacy Mongoose files:

| Prisma model | Legacy file |
|--------------|-------------|
| `User` | [`models/User.js`](../../backend-legacy/models/User.js) |
| `RefreshSession` | [`models/RefreshSession.js`](../../backend-legacy/models/RefreshSession.js) |
| `OtpVerification` | [`models/OtpVerification.js`](../../backend-legacy/models/OtpVerification.js) |
| `Wallet` | [`models/Wallet.js`](../../backend-legacy/models/Wallet.js) |
| `Investment` | [`models/Investment.js`](../../backend-legacy/models/Investment.js) |
| `PurchaseOrder` | [`models/PurchaseOrder.js`](../../backend-legacy/models/PurchaseOrder.js) |
| `FailedInvestment` | [`models/FailedInvestment.js`](../../backend-legacy/models/FailedInvestment.js) |
| `FeeSponsorship` | [`models/FeeSponsorship.js`](../../backend-legacy/models/FeeSponsorship.js) |
| `TreasuryLedger` | [`models/TreasuryLedger.js`](../../backend-legacy/models/TreasuryLedger.js) |
| `TreasuryEvent` | [`models/TreasuryEvent.js`](../../backend-legacy/models/TreasuryEvent.js) |
| `AppRevenueWithdrawal` | [`models/AppRevenueWithdrawal.js`](../../backend-legacy/models/AppRevenueWithdrawal.js) |
| `Profile` | [`models/Profile.js`](../../backend-legacy/models/Profile.js) — P2 |
| `Photo` | [`models/Photo.js`](../../backend-legacy/models/Photo.js) — P2 |

- [ ] Add enums: `InvestmentStatus`, `PayabilityStatus`, `PurchaseOrderStatus`, `PurchaseOrderStep`, `TreasuryEventType`, etc.
- [ ] Recreate indexes (e.g. Investment `user + fundId` partial unique for open statuses; `status + maturesAt`)
- [ ] Implement `src/lib/prisma.ts` singleton
- [ ] Run `npx prisma generate`
- [ ] Run `npx prisma db push` against dev/staging Atlas (document in README)
- [x] Seed script: [`prisma/seed.ts`](../../prisma/seed.ts) — create global treasury ledger with zeros if missing (no backfill from investments)

## Files to create

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | All models |
| `src/lib/prisma.ts` | Client export |
| `prisma/seed.ts` | Empty global treasury ledger on first setup |

## Verification

- [ ] `prisma generate` succeeds
- [ ] `db push` applies without errors on a copy of dev data (or empty DB)
- [ ] Can `findMany` User/Investment via a one-off script
- [ ] Treasury ledger singleton id `global` exists after `db:seed` (zeros only)

## Reference (legacy)

- [`backend-legacy/models/`](../../backend-legacy/models/)
- [`backend-legacy/config/db.js`](../../backend-legacy/config/db.js) — connection only; Prisma uses `DATABASE_URL`

## Out of scope

- Rewriting services to use Prisma (steps 02+)
- New features in `backend-legacy` Mongoose models (freeze legacy)

**Rule:** After this step, schema changes happen only in `backend/prisma/schema.prisma`.
