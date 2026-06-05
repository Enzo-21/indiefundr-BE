# Step 11 — Admin API

## Goal

Port `/api/admin/treasury/*` for the separate admin Next app. JSON-only; `ADMIN_API_KEY` header auth.

## Prerequisites

- [Step 08](step-08-revenue-engine.md) — treasury services
- [Step 03](step-03-auth-and-middleware.md) — `verifyAdminApiKey`

## Tasks

- [ ] Port [`routes/api/admin/treasury.js`](../../backend-legacy/routes/api/admin/treasury.js) → `app/api/admin/treasury/**/route.ts`
- [ ] Port [`controllers/adminTreasuryController.js`](../../backend-legacy/controllers/adminTreasuryController.js) → `src/services/admin/treasury.ts`
- [ ] Each route calls `verifyAdminApiKey` first
- [ ] Endpoints (verify against legacy file):
  - Ledger snapshot / pool metrics
  - Treasury events list
  - Withdrawals (create/list) if present in legacy
  - Manual evaluate trigger (if exposed)
- [ ] No CORS exposure to Expo origins required; admin app only

## Files to create

| File | Purpose |
|------|---------|
| `src/services/admin/treasury.ts` | Admin operations |
| `app/api/admin/treasury/**/route.ts` | REST for admin UI |

## Verification

- [ ] `curl` with `x-admin-api-key` returns 200 on ledger endpoint
- [ ] Missing key returns 401/403 same as legacy
- [ ] Withdrawal creation updates `AppRevenueWithdrawal` + ledger

## Reference (legacy)

- [`backend-legacy/routes/api/admin/treasury.js`](../../backend-legacy/routes/api/admin/treasury.js)
- [`backend-legacy/middlewares/adminAuth.js`](../../backend-legacy/middlewares/adminAuth.js)

## Out of scope

- Admin UI pages (step 12)
- Expo client
