# Step 12 — Server Actions (admin UI)

## Goal

Add `src/actions/` for the **admin Next.js app** (same repo or merged later). Server Actions call the same services as admin REST — not used by Expo.

## Prerequisites

- [Step 11](step-11-admin-api.md) — treasury services stable
- Admin UI app exists or `app/(admin)/` scaffold planned

## Tasks

- [ ] Create `src/actions/treasury/` with typed actions:
  - `getLedgerSnapshot`
  - `listTreasuryEvents`
  - `requestWithdrawal` (if applicable)
  - `triggerEvaluate` (if applicable)
- [ ] Auth: verify admin session or `ADMIN_API_KEY` in server action context (never expose key to client bundle)
- [ ] Optional: `app/(admin)/treasury/page.tsx` consuming actions (future UI)
- [ ] Document: Expo must **never** import from `src/actions/`

## Files to create

| File | Purpose |
|------|---------|
| `src/actions/treasury/*.ts` | `'use server'` wrappers |
| `app/(admin)/treasury/page.tsx` | Optional dashboard |

## Verification

- [ ] Server action callable from admin page in dev
- [ ] Unauthorized call returns error without leaking ledger data
- [ ] Actions and REST admin routes return consistent data shapes

## Reference (legacy)

- Same services as [step 11](step-11-admin-api.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — admin boundary

## Out of scope

- Public marketing site
- Mobile app integration
- Replacing admin REST (actions are additive for RSC admin UI)
