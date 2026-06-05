# Manual admin operations (no cron)

## Goals

- **Automated on user reads:** inbound USDT wallet sync (`syncWallet` on stale portfolio/activity).
- **Event-driven ledger:** treasury pool/surplus/revenue update on explicit admin actions only—no background evaluate ticks.

## Non-goals

- Background cron / Vercel scheduled jobs.
- Batch “evaluate everything” on a timer.
- User-initiated payout claims (`POST /api/investments/:id/redeem` always returns 403).

## Event → ledger map

| Admin action | What runs |
|--------------|-----------|
| **Mark order successful** | `recordSubscribeInflow` (pool + protected revenue + surplus slice) + `evaluatePayoutReadiness` (two-user unlock flags) |
| **Open Investments page** | `markMaturedInvestments` (time-based status only) |
| **Pay now / Pay with surplus** | `executeInvestmentPayout` / `executeSurplusInvestmentPayout` (broadcast only) |
| **Confirm payout on-chain** | `onRedeemCompleted` → `recordPayoutOutflow` |
| **Reconcile treasury** (optional) | `reconcileTreasuryLedgerFromExpected` — drift repair only |
| **Sync treasury history** (optional) | `syncAdminOnChainHistory` |

## User vs admin flow

1. **User** subscribes → manual `PurchaseOrder`, USDT reserved.
2. **Admin** marks successful → ledger inflow + unlock scan (no full queue evaluate).
3. **Admin** opens Investments → overdue `active` → `matured`.
4. **Admin** pays → `redeeming` → **Confirm payout on-chain** → `redeemed` + ledger outflow.
5. **User** wallet refresh → inbound `syncWallet` only.

## Environment

Copy [`.env.example`](../.env.example). No `CRON_*` or automation toggles.

## Admin UI

| Location | Action |
|----------|--------|
| `/admin/subscriptions` | Fulfill orders, mark success/fail |
| `/admin/investments` | Oldest-first table; pool/surplus/protected columns from treasury events (CSV-style); maturity on load; Pay now; Pay with surplus; Confirm payout on-chain |
| `/admin/treasury` | Reconcile treasury; Sync treasury history |

## Verification checklist

1. `npm run dev` — only `[next]` logs (no `[cron]`; kill stale `dev-cron-ticker` if needed).
2. Mark order successful → `subscribe_inflow` / `surplus_credit` without Reconcile.
3. Open Investments → matured rows update without cron.
4. Pay → Confirm on-chain → `redeemed` + payout outflow event.
