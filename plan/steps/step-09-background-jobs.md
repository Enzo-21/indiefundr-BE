# Step 09 — Background jobs

## Goal

Replace the legacy **every-minute** cron in [`server.js`](../../backend-legacy/server.js) with a deployable job runner that calls the same pipeline in order — **optimized for Vercel serverless timeouts**.

## Prerequisites

- [Step 07](step-07-services-blockchain.md) — `processPendingPurchaseOrders`
- [Step 08](step-08-revenue-engine.md) — `markMaturedInvestments`, `evaluateAll`, redemption confirmations

## Decision (default)

**Option A — Vercel Cron** → `src/app/api/cron/investments/route.ts` secured with `CRON_SECRET`.

- Set `maxDuration` in [`next.config.ts`](../../next.config.ts) (e.g. 60s on Pro; Hobby plan ~10s — keep each tick bounded).
- Process **one batch** of purchase orders per tick (`PURCHASE_ORDER_BATCH_LIMIT`); avoid blocking on long Tron confirmation waits inside a single invocation.
- If timeouts persist, fall back to **Option B** (separate worker on Railway/Fly).

Clients learn state changes via **HTTP polling** ([step 10](step-10-realtime-polling.md)), not Socket.io pushes.

## Tasks

- [ ] Implement orchestrator `src/jobs/investmentPipeline.ts`:

```text
1. processPendingPurchaseOrders()  // bounded batch
2. markMaturedInvestments()
3. revenueEngine.evaluateAll()
4. processRedemptionConfirmations()
```

- [ ] Secure cron route: verify `Authorization: Bearer ${CRON_SECRET}` or Vercel cron header
- [ ] Log duration and counts per stage (match legacy console patterns)
- [ ] Handle partial failure: one stage error should not skip subsequent stages if safe (document behavior)
- [x] `scripts/run-cron-once.ts` for local/dev manual run
- [x] `scripts/dev-cron-ticker.ts` — started automatically by `npm run dev`

## Files to create

| File | Purpose |
|------|---------|
| `src/jobs/investmentPipeline.ts` | Ordered pipeline |
| `src/app/api/cron/investments/route.ts` | Vercel Cron HTTP trigger |
| `scripts/run-cron-once.ts` | Local/dev manual run |
| `scripts/dev-cron-ticker.ts` | Dev-only minute ticker → same cron route |

## Verification

- [ ] Local: run pipeline once; pending order advances
- [ ] Matured investments get `payoutEligibleAt` set
- [ ] Payability updates after evaluate
- [ ] Staging: cron fires every minute for 5 minutes without duplicate processing bugs
- [ ] Cron completes within Vercel function timeout for configured plan

## Reference (legacy)

- [`backend-legacy/server.js`](../../backend-legacy/server.js) — `setInterval` block
- [`backend-legacy/services/purchaseOrderProcessor.js`](../../backend-legacy/services/purchaseOrderProcessor.js)
- [`backend-legacy/services/revenueEngine/index.js`](../../backend-legacy/services/revenueEngine/index.js)

## Out of scope

- Socket.io / realtime pushes (use polling — step 10)
- Changing pipeline order
