# Step 00 — Foundation

## Goal

Prepare the Next.js `backend/` project: folder tree, core dependencies, health endpoint, and pointer docs. No business logic yet.

## Prerequisites

- None (first step).
- [ARCHITECTURE.md](../../ARCHITECTURE.md) and [CONVENTIONS.md](../../CONVENTIONS.md) exist.

## Tasks

- [ ] Create directory scaffold:
  - `src/lib/`, `src/services/`, `src/actions/`
  - `app/api/health/` (or document `app/page.tsx` as health)
  - `prisma/` (empty until step 01)
- [ ] Add dependencies (audit against [`backend-legacy/package.json`](../../backend-legacy/package.json)):
  - `prisma`, `@prisma/client`
  - `zod`
  - `jsonwebtoken`, `bcryptjs`, `resend`, `tronweb`
  - `@react-email/components`, `@react-email/render` (OTP emails)
  - `cloudinary` (if profile photos migrated later)
- [ ] Add dev/test scripts: `prisma generate`, `test` (Node test runner)
- [ ] Implement `GET` health response matching legacy: `API Running Correctly`
- [ ] Add `backend/.env.example` listing vars (copy from legacy, add `DATABASE_URL` for Prisma)
- [ ] Configure `tsconfig.json` paths alias `@/` → `src/` if desired

## Files to create

| File | Purpose |
|------|---------|
| `app/api/health/route.ts` | Health check |
| `src/lib/.gitkeep` or README stub | Placeholder |
| `.env.example` | Env template |

## Verification

- [ ] `npm run dev` starts Next on port 3000 (or configured port)
- [ ] `curl http://localhost:3000/api/health` returns success body
- [ ] `npm run build` succeeds

## Reference (legacy)

- [`backend-legacy/server.js`](../../backend-legacy/server.js) — `GET /`
- [`backend-legacy/package.json`](../../backend-legacy/package.json)

## Out of scope

- Prisma schema (step 01)
- Any `/api/auth` or wallet routes
- Socket.io, cron
