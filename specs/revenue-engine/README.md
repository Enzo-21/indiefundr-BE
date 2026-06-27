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
| **A_tier** | `getInvestmentAmountUsdtForLevel(user.level)` | **25 / 50 / 75 / 100** USDT by player level (new orders) |
| **A_ref** | `COHORT_REFERENCE_INVESTMENT_USDT` | **25** USDT — fixed reference for `APP_NET` ratio (code constant) |
| **A_inv** | `Investment.amountUsdt` | **Frozen** principal per investment (cohort) |
| **P_prot_ref** | `APP_NET_REVENUE_PER_SUBSCRIBER_USDT` | **10** USDT platform share per **A_ref** (not per current **A**) |
| **P_prot(inv)** | `protectedRevenueForAmount(A_inv)` | `A_inv × (P_prot_ref / A_ref)` — scales linearly with cohort principal |
| **P_head** | `projectedPayoutUsdt` | `A_inv × (1 + R/100)` where **R** is fund `returnPercent90d` |

**Triad structure** (one payout head + unlockers whose principal sums to **2 × A_head**):

- Gross inflow (homogeneous triad at amount **A_leg**): **G_triad = 3 × A_leg**
- Protected (platform) in triad: **Σ P_prot(leg)** across head + unlockers (or **3 × P_prot(A_leg)** when all legs share the same amount)
- User payout: fund-specific **P_head** on the head investment
- **Triad surplus**: **S_triad = G_triad − protected − P_head** (see [`investmentCohort.ts`](../../src/lib/config/investmentCohort.ts))

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
2. Each candidate head with principal **A_head** requires **2 × A_head** USDT of principal from **later** investments (FIFO prefix of unlockers not already consumed).
3. One unlocker investment is consumed in full when selected (excess principal stays in the pool via subscribe inflow; it does not roll to another head).
4. Mixed cohorts: e.g. head **25** USDT unlocks after a single **50** USDT later investment; head **50** USDT needs **100** USDT from later investors (two **50** or one **100**, etc.).

**Max triad heads in one pass** (sequential cohort, all **A_inv = A**): `T_max = floor((N − 1) / 2)` (e.g. **N = 100 → 49**).

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
poolAvailable += A_inv
treasurySurplus += S_sub     where S_sub = round(S_triad(A_inv) / 3, 2)
```

`S_triad` uses that investment’s `projectedPayoutUsdt` and **A_inv** (`amountUsdt`). Ratio **P_prot_ref / A_ref** is **not** tied to the current env subscribe price — doubling **A_inv** doubles protected share and surplus slice. Surplus is **not** credited again when a triad payout completes.

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
| Gross subscribed | **G = Σ A_inv** |
| Surplus credited (subscribe) | **S_total ≈ Σ S_sub(inv)** per investment |
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
| Unlock selection | `payoutScheduler.test.ts`, `payoutScheduler.cohort.test.ts` |
| Cohort math | `investmentCohort.test.ts`, `accounting.test.ts` |
| Cohort simulation | `triadSimulation.test.ts` |
| Expected ledger (read-only) | `ledgerReconcile.test.ts`, `buildLedgerIntegrityReport()` |

**Ledger integrity:** `computeExpectedLedger` and admin Treasury integrity UI are **read-only**. Auto-reconcile (`reconcileTreasuryLedgerFromExpected`) no longer writes DB state — the event-sourced ledger is authoritative.

---

## Migration note

Subscribe amount is tiered by player level (see [`pricing.ts`](../../src/lib/config/pricing.ts)); each row keeps frozen **A_inv**. Surplus/protected math uses **A_ref = 25** and scales with **A_inv**. After deploy, run read-only integrity report to check drift; do **not** run legacy auto-reconcile against mixed cohorts.

Ledgers populated before surplus-on-subscribe may show surplus only from historical payout `surplus_credit` rows.
