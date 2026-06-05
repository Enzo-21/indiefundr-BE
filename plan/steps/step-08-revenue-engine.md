# Step 08 — Revenue engine

## Goal

Port the treasury / payability engine from legacy to `src/services/revenueEngine/` using Prisma. Wire hooks on subscribe, maturity, redeem, and expose evaluation for cron.

## Prerequisites

- [Step 01](step-01-prisma-schema.md) — Treasury models + Investment payability fields
- [Step 02](step-02-src-lib.md) — `revenueEngine` config
- [Step 06](step-06-api-funds-investments.md) — subscribe/redeem entry points
- [Step 07](step-07-services-blockchain.md) — investment becomes `open` after order completes

## Tasks

- [ ] Port [`services/revenueEngine/`](../../backend-legacy/services/revenueEngine/) → `src/services/revenueEngine/`:
  - queue, pool, ledger, riskRank, withdrawals, `index.ts` (`evaluateAll`, `onSubscribe`, etc.)
- [ ] Port maturity helper: set `payoutEligibleAt` = `maturesAt` + 7 days
- [ ] Hook subscribe completion → ledger credit + `evaluateAll` for user
- [ ] Hook redeem completion → surplus credit per spec v1.5
- [ ] `canRedeem` / `canClaim` logic in presentation layer uses engine state
- [ ] Port tests: [`test/revenueEngine.test.js`](../../backend-legacy/test/revenueEngine.test.js) → `backend` test runner (target 21+ cases)

## Files to create

| File | Purpose |
|------|---------|
| `src/services/revenueEngine/*.ts` | Full engine |
| `src/services/investments/maturity.ts` | `markMaturedInvestments` |
| `test/revenueEngine.test.ts` | Parity tests |

## Verification

- [ ] All revenue engine unit tests pass
- [ ] Manual: subscribe → ledger `pool_after` updated
- [ ] Manual: matured + eligible investment can become `payable` when pool allows
- [ ] Redeem blocked when `payabilityStatus !== 'payable'`

## Reference (legacy)

- [`specs/revenue-engine/README.md`](../../specs/revenue-engine/README.md)
- [`backend-legacy/services/revenueEngine/`](../../backend-legacy/services/revenueEngine/)
- Ledger updates only via app events (`recordSubscribeInflow`, `recordAppWithdrawal`, etc.); optional `npm run db:seed` for empty global row

## Out of scope

- Cron scheduling (step 09)
- Admin treasury API (step 11)
