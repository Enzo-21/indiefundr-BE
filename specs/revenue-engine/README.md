# Revenue engine — specification (Next.js backend)

Canonical business rules and triad math for the treasury payout engine implemented in [`src/services/revenueEngine/`](../../src/services/revenueEngine/).

**Configuration:** [`src/lib/config/revenueEngine.ts`](../../src/lib/config/revenueEngine.ts) · **Tests:** `src/services/revenueEngine/*.test.ts`

**Related:** Per-fund investment slot caps and subscribe gates — [`../investments/README.md`](../investments/README.md).

---

## Table of contents

1. [Constants and roles](#constants-and-roles)
2. [Triad math examples](#triad-math-examples)
3. [Unlocker consumption](#unlocker-consumption)
4. [Ledger buckets](#ledger-buckets)
5. [Surplus on subscription](#surplus-on-subscription)
6. [Surplus liquidity payouts (FIFO)](#surplus-liquidity-payouts-fifo)
7. [Cohort formulas](#cohort-formulas)
8. [Simulations](#simulations)
9. [Verification](#verification)
10. [Migration note](#migration-note)

---

## Constants and roles

| Symbol | Code | Value |
|--------|------|-------|
| **A** | `INVESTMENT_AMOUNT_USDT` | **25** USDT principal per completed investment |
| **P_prot** | `APP_NET_REVENUE_PER_SUBSCRIBER_USDT` | **10** USDT platform share per triad (surplus math only; not a per-sub withdrawable cap) |
| **P_head** | `projectedPayoutUsdt` | `A × (1 + R/100)` where **R** is fund `returnPercent90d` |

**Triad structure** (one payout head + two unlocker investments):

- Gross inflow: **G_triad = 3 × A = 75** USDT
- Protected (platform) in triad: **3 × P_prot = 30** USDT
- User payout: fund-specific **P_head**
- **Triad surplus** (total margin above protected + payout): **S_triad = G_triad − 3×P_prot − P_head**

---

## Triad math examples

| Fund | R | P_head | S_triad | S_sub (÷3) |
|------|---|--------|---------|------------|
| Aggressive Alpha | 40% | 35.00 | 10.00 | 3.33 |
| Growth Partners | 25% | 31.25 | 13.75 | 4.58 |
| Balanced Growth | 15% | 28.75 | 16.25 | 5.42 |
| Stable Yield | 10% | 27.50 | 17.50 | 5.83 |
| Capital Shield | 6% | 26.50 | 18.50 | 6.17 |

---

## Unlocker consumption

Implemented in [`payoutScheduler.ts`](../../src/services/revenueEngine/payoutScheduler.ts) (`findUnlockingInvestments`, `evaluatePayoutReadiness`):

1. Investments ordered by `subscribedAt` ascending.
2. Each candidate gets the **first two later** investments not already consumed as unlockers.
3. Unlockers are one-shot (cannot unlock two payouts).

**Max triads in one pass** (sequential cohort 1…N): `T_max = floor((N − 1) / 2)` (e.g. **N = 100 → 49** triad heads).

---

## Ledger buckets

| Bucket | Meaning |
|--------|---------|
| **poolAvailable** | Subscriptions minus payouts minus platform withdrawals |
| **treasurySurplus** | Payout buffer **inside** the pool (not withdrawable by the app) |
| **Withdrawable liquidity** | `max(0, poolAvailable − treasurySurplus)` (2dp truncate; matches CSV `protected_withdrawable`) |
| **protectedRevenueCredited** | Legacy DB field; no longer incremented on subscribe |
| **subscriberSlotsCredited / Consumed** | Legacy DB fields; withdrawable no longer uses slot caps |

Surplus is **not** extra cash on top of the treasury — it labels liquidity reserved for user payouts within the same pool.

---

## Surplus on subscription

On each completed subscribe ([`recordSubscribeInflow`](../../src/services/revenueEngine/ledger.ts)):

```
poolAvailable += A
treasurySurplus += S_sub     where S_sub = round(S_triad / 3, 2)
```

`S_triad` uses that investment’s `projectedPayoutUsdt` (fund-specific). Surplus is **not** credited again when a triad payout completes.

---

## Surplus liquidity payouts (FIFO)

Admins may pay from surplus via **Pay with surplus** on the Investments table ([`executeSurplusInvestmentPayout`](../../src/services/revenueEngine/payoutScheduler.ts)) when normal two-user-unlock **Pay now** is not available.

1. Walk candidates in `subscribedAt` order (then `id`).
2. Skip paid, redeeming, unlocked, and other non-candidates without stopping the queue.
3. Allocate remaining `treasurySurplus` in FIFO order: each eligible investment must fit the **remaining** surplus after earlier allocations. When a candidate’s payout exceeds remaining surplus, the queue **stops** — later rows are not eligible even if their payout alone fits total surplus.
4. Admin action draws surplus and records payout outflow when eligible.
5. Trigger: `admin_surplus_liquidity` (automatic `cron_*` payout paths are disabled).

**UI:** If **Pay now** is available (`payoutUnlockedAt` set), only that action is shown. **Pay with surplus** appears only as a fallback for FIFO-eligible rows without a normal unlock.

[`computeFifoSurplusEligibleInvestmentIds`](../../src/services/revenueEngine/payoutScheduler.ts) centralizes allocation; execution rejects attempts to pay investments outside that set.

Triad-unlocked payouts still use the normal admin **Pay now** path when `payoutUnlockedAt` is set.

---

## Cohort formulas

Given **N** subscriptions and fund-specific **S_sub**:

| Quantity | Formula |
|----------|---------|
| Gross subscribed | **G = N × A** |
| Surplus credited (subscribe) | **S_total ≈ N × S_sub** |
| Triad payouts | up to **T_max = floor((N−1)/2)** per fund mix |
| Pool (no withdrawals) | **pool ≈ G − Σ payouts − W** |
| Withdrawable | **pool − surplus** |

### Closed cohort (100 × Aggressive Alpha, simulation)

After all events in [`simulations/aggressive-alpha-100-investments-simulation.csv`](simulations/aggressive-alpha-100-investments-simulation.csv): **pool ≈ 785**, **surplus ≈ 18**, **withdrawable ≈ 767** (49 triad heads + inline surplus pays; not all 100 users paid).

Production still enforces maturity, on-chain transfer, and payability gates; CSVs model ledger timing only.

---

## Simulations

Reference CSVs under [`simulations/`](simulations/) (columns: `event`, `fund`, `return_percent`, `pool`, `treasury_surplus`, `protected_withdrawable` = pool − surplus):

| File | Description |
|------|-------------|
| [aggressive-alpha-100-investments-simulation.csv](simulations/aggressive-alpha-100-investments-simulation.csv) | 100 Aggressive; surplus on sub; FIFO surplus pays |
| [growth-partners-100-investments-simulation.csv](simulations/growth-partners-100-investments-simulation.csv) | 100 Growth Partners only |
| [balanced-growth-100-investments-simulation.csv](simulations/balanced-growth-100-investments-simulation.csv) | 100 Balanced Growth only |
| [stable-yield-100-investments-simulation.csv](simulations/stable-yield-100-investments-simulation.csv) | 100 Stable Yield only |
| [capital-shield-100-investments-simulation.csv](simulations/capital-shield-100-investments-simulation.csv) | 100 Capital Shield only |
| [mixed-funds-200-investments-simulation.csv](simulations/mixed-funds-200-investments-simulation.csv) | 200 subs, 40 per fund, shuffled order |

**Related:** Referral recovery draws invitee bonuses from `treasurySurplus` and principal recovery from `poolAvailable`. See the [Referral recovery & Invite & Earn spec](../referral-recovery/README.md) and [`referral-recovery-2-invitees.csv`](../referral-recovery/simulations/referral-recovery-2-invitees.csv).

---

## Verification

| Area | Tests / code |
|------|----------------|
| Triad accounting | `accounting.test.ts` |
| Unlock selection | `payoutScheduler.test.ts` |
| Cohort simulation | `triadSimulation.test.ts` |
| Expected ledger | `ledgerReconcile.test.ts`, `computeExpectedLedger()` |

---

## Migration note

Ledgers populated before surplus-on-subscribe may show surplus only from historical payout `surplus_credit` rows. Run [`reconcileTreasurySurplusFromTriads`](../../src/services/revenueEngine/ledgerReconcile.ts) after deploy or accept drift until subscriptions/payouts move the ledger forward.
