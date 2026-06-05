# Step 06 — API: funds + investments

## Goal

Port invest flow HTTP: fund catalog, subscribe, orders, investment list, redeem. Responses must include presentation fields for [`HoldingCard`](../../frontend/components/invest/HoldingCard.tsx).

## Prerequisites

- [Step 01](step-01-prisma-schema.md) — `Investment`, `PurchaseOrder`
- [Step 02](step-02-src-lib.md) — `investmentFunds`, `pricing`
- [Step 05](step-05-api-wallets.md) — wallet for subscribe

## Tasks

- [ ] Port [`controllers/fundsController.js`](../../backend-legacy/controllers/fundsController.js) → services + routes
- [ ] Port [`controllers/investmentController.js`](../../backend-legacy/controllers/investmentController.js)
- [ ] Port [`utils/investmentPresentation.js`](../../backend-legacy/utils/investmentPresentation.js) → `src/lib/investmentPresentation.ts`
- [ ] Routes:
  - [ ] `GET app/api/funds/route.ts` — catalog
  - [ ] `POST app/api/funds/estimate/route.ts`
  - [ ] `POST app/api/funds/subscribe/route.ts`
  - [ ] `GET app/api/funds/orders/current/route.ts`
  - [ ] `GET app/api/funds/orders/[orderId]/route.ts`
  - [ ] `GET app/api/investments/route.ts`
  - [ ] `POST app/api/investments/[id]/redeem/route.ts`
- [ ] Enrich list/detail with: `canClaim`, `statusLabel`, `payabilityStatus`, `payoutEligibleAt`, `newSubscribersNeeded` (match legacy)
- [ ] Redeem: gate on `canRedeem` / payability (revenue engine rules)

## Files to create

| File | Purpose |
|------|---------|
| `src/services/funds/*.ts` | Subscribe, orders |
| `src/services/investments/*.ts` | List, redeem |
| `src/lib/investmentPresentation.ts` | Labels and claim eligibility |
| `app/api/funds/**`, `app/api/investments/**` | Routes |

## Verification

- [ ] Subscribe creates `PurchaseOrder` and returns order id
- [ ] `GET /api/investments` returns enriched holdings for Expo portfolio
- [ ] Redeem returns 400 when not payable (same message family as legacy)
- [ ] Estimate matches legacy fee breakdown

## Reference (legacy)

- [`backend-legacy/routes/api/funds.js`](../../backend-legacy/routes/api/funds.js)
- [`backend-legacy/routes/api/investments.js`](../../backend-legacy/routes/api/investments.js)
- [`specs/revenue-engine/README.md`](../../specs/revenue-engine/README.md)

## Out of scope

- Revenue engine cron (steps 08–09)
- Purchase order blockchain processing (step 07–09)
- Socket emit on subscribe (step 10)
