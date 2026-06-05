# Step 02 — `src/lib` (config and constants)

## Goal

Port legacy `config/` and `constants/` into typed TypeScript under `src/lib/`, with Zod-validated environment variables.

## Prerequisites

- [Step 01](step-01-prisma-schema.md) complete (optional for pure config, but recommended).

## Tasks

- [ ] Create `src/lib/env.ts` — Zod schema for all required env vars (mirror [`config/validateConfig.js`](../../backend-legacy/config/validateConfig.js) + `DATABASE_URL`)
- [ ] Port [`config/pricing.js`](../../backend-legacy/config/pricing.js) → `src/lib/config/pricing.ts`
- [ ] Port [`config/investmentFunds.js`](../../backend-legacy/config/investmentFunds.js) → `src/lib/config/investmentFunds.ts`
- [ ] Port [`config/revenueEngine.js`](../../backend-legacy/config/revenueEngine.js) → `src/lib/config/revenueEngine.ts`
- [ ] Port revenue-related defaults from [`config/default.js`](../../backend-legacy/config/default.js) into env or constants
- [ ] Port [`constants/appBranding.js`](../../backend-legacy/constants/appBranding.js) → `src/lib/constants/appBranding.ts`
- [ ] Export a single `src/lib/config/index.ts` for clean imports

## Files to create

| File | Purpose |
|------|---------|
| `src/lib/env.ts` | Validated `process.env` |
| `src/lib/config/pricing.ts` | `INVESTMENT_AMOUNT_USDT`, `projectedPayoutUsdt`, etc. |
| `src/lib/config/investmentFunds.ts` | Fund catalog |
| `src/lib/config/revenueEngine.ts` | Margin formulas |
| `src/lib/constants/appBranding.ts` | Branding for emails |

## Verification

- [ ] Unit test: `projectedPayoutUsdt(25, 40) === 35`
- [ ] Missing `JWT_ACCESS_SECRET` fails fast at startup with clear message
- [ ] Fund catalog includes all five `fundId` values from legacy

## Reference (legacy)

- [`backend-legacy/config/`](../../backend-legacy/config/)
- [`backend-legacy/constants/`](../../backend-legacy/constants/)

## Out of scope

- Auth token issuance (step 03)
- HTTP routes
