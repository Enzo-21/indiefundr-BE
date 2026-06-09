# Investment slots — specification

Users may hold multiple **open** positions in the same fund, up to a per-fund cap configured in [`src/lib/config/investmentFunds.ts`](../../src/lib/config/investmentFunds.ts) (`maxOpenInvestments`, default **5**).

## Open vs closed positions

**Open statuses** (count toward the slot cap): `pending`, `active`, `matured`, `redeeming`.

**Closed statuses** (free a slot): `redeemed`, `referral_recovered`, `failed`.

Helpers: [`src/lib/config/investmentSlots.ts`](../../src/lib/config/investmentSlots.ts).

## Subscribe gates

| Check | Behavior |
|-------|----------|
| Open count vs cap | `POST /api/funds/subscribe` returns **400** `SLOTS_FULL` when `openCount >= maxOpenInvestments` |
| Active purchase order | Still **one** `queued` / `processing` order per user per fund (Mongo partial unique index) |

Investment rows are created inside a transaction that re-counts open positions before insert.

## Interaction with revenue engine

| Area | Behavior with multiple positions |
|------|----------------------------------|
| Maturity | Each investment matures on its own `maturesAt` |
| Triad unlock | Global FIFO by `subscribedAt`; same user's later subs can unlock earlier positions |
| Surplus FIFO | Per-investment eligibility in global queue order |
| User payout queue | **One** matured-unpaid investment per user advances at a time ([`queue.ts`](../../src/services/revenueEngine/queue.ts)) |
| Referral recovery | Eligibility is per investment; invite attribution uses **oldest** `recoveryEligibleAt` |

## Wallet UI

Portfolio `byFund` rows aggregate multiple positions in the same fund (`amountUsdt` sum, `positionCount`).

## Ops

After deploying slot logic, run `npm run db:indexes` to drop the legacy `user_1_fundId_1_open_unique` partial unique index on `investments`.
