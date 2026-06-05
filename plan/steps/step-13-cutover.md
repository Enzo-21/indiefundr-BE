# Step 13 — Cutover

## Goal

Switch production traffic from `backend-legacy` to `backend` with verified API, cron, and socket parity. Decommission Express when stable.

## Prerequisites

- Steps **00–12** complete (or documented exceptions with product approval)
- [plan/README.md](../README.md) API parity matrix all **Done**

## Tasks

- [ ] Run full parity checklist (method, path, status, body keys) against Expo flows:
  - Auth (start → verify → refresh → logout)
  - Wallets (generate, portfolio, balance, main)
  - Invest (catalog → estimate → subscribe → order poll)
  - Holdings (list, redeem when payable)
  - Push token registration
- [ ] Shadow mode (optional): proxy subset of traffic to Next, diff responses
- [ ] Env matrix: document every `API_URL`, `DATABASE_URL`, Tron keys, `CRON_SECRET`, socket URL in [plan/README.md](../README.md)
- [ ] Staging: point Expo staging build at Next staging for 48h QA
- [ ] Production flip: update `API_URL` / DNS / load balancer
- [ ] Monitor: error rates, order stuck count, treasury pool drift
- [ ] Keep `backend-legacy` read-only rollback for one release cycle
- [ ] Archive or delete `backend-legacy` after cron + sockets + API verified 2 weeks

## Files to create / update

| File | Purpose |
|------|---------|
| `plan/CUTOVER.md` | Dated checklist sign-off |
| `plan/README.md` | Update status table to Done |

## Verification

- [ ] Production Expo build completes full invest + claim flow
- [ ] No increase in 5xx vs legacy baseline
- [ ] Cron processes orders within SLA (compare legacy timing)
- [ ] Socket events received on physical device
- [ ] Admin treasury operations work against production Next

## Reference

- [API parity matrix](../README.md)
- [`frontend/redux`](../../frontend/redux) — all API paths

## Out of scope

- Frontend feature work
- Schema migrations on legacy Mongoose (frozen)

## Rollback plan

1. Revert `API_URL` to legacy host
2. Stop Next cron trigger
3. Investigate diff logs; fix forward on branch
