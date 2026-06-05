# Backend conventions (Next.js)

Rules for the production API in this folder. Source of truth for structure during migration from [`backend-legacy/`](../backend-legacy/).

---

## Folder layout

```
backend/
├── public/
├── src/
│   ├── app/
│   │   ├── api/              # REST Route Handlers (Expo + admin JSON API)
│   │   └── admin/            # Admin UI pages (/admin/login, /admin/treasury)
│   ├── prisma/
│   │   └── schema.prisma     # Database (MongoDB via Prisma)
│   ├── lib/                  # Config, env, Prisma client, auth helpers, constants
│   ├── services/             # Business logic (ported from legacy services/)
│   └── actions/              # Server Actions — admin panel only
├── plan/                     # Migration playbook (incremental steps)
├── ARCHITECTURE.md
└── CONVENTIONS.md
```

| Path | Use for | Do not use for |
|------|---------|----------------|
| `src/app/api/**/route.ts` | HTTP endpoints the Expo app calls | Heavy business logic |
| `src/services/` | Tron, orders, revenue engine, auth, mail | HTTP request/response |
| `src/lib/` | Env, Prisma singleton, pricing/funds config | Feature workflows |
| `src/actions/` | Admin Server Actions (forms, mutations) | Expo-facing APIs |

**Important:** [`frontend/`](../frontend/) (Expo) must **never** import from `src/actions/` or `@/actions/*`. Admin UI lives in this backend app only; mobile uses `/api/*` REST routes.

---

## Express → Next.js mapping

| Legacy (`backend-legacy/`) | Next (`backend/`) |
|----------------------------|-------------------|
| `server.js` | `src/app/` + `instrumentation.ts` / cron routes (see step 09) |
| `routes/api/*.js` | `src/app/api/**/route.ts` |
| `controllers/*.js` | Logic moves to `src/services/`; routes stay thin |
| `middlewares/authMiddleware.js` | `src/lib/auth/verifyAccessToken.ts` |
| `middlewares/adminAuth.js` | `src/lib/auth/verifyAdminApiKey.ts` |
| `models/*.js` (Mongoose) | `src/prisma/schema.prisma` |
| `config/*.js` | `src/lib/config/*.ts` |
| `constants/*.js` | `src/lib/constants/*.ts` |
| `utils/*.js` | `src/lib/` or colocate in services |
| `services/*.js` | `src/services/*.ts` |

**No `controllers/` directory** in the Next app. Route handlers should: parse request → call service → return `Response.json()`.

---

## API route naming

Match legacy URLs **exactly** so the Expo app keeps working without changes.

| Legacy path | Next App Router file |
|-------------|----------------------|
| `GET /` | `src/app/page.tsx` or `src/app/api/health/route.ts` |
| `POST /api/auth/start` | `src/app/api/auth/start/route.ts` |
| `GET /api/wallets/portfolio` | `src/app/api/wallets/portfolio/route.ts` |
| `GET /api/wallets/:walletId` | `src/app/api/wallets/[walletId]/route.ts` |
| `POST /api/investments/:id/redeem` | `src/app/api/investments/[id]/redeem/route.ts` |

**Static segments before dynamic:** e.g. `portfolio`, `balance`, `user`, `generate` must be defined as separate routes, not captured by `[walletId]`.

---

## Auth headers (unchanged)

| Client | Header | Middleware |
|--------|--------|------------|
| Expo user app | `x-auth-token` (JWT access) | `verifyAccessToken` |
| Admin API / admin app | `x-admin-api-key` or `Authorization: Bearer` | `verifyAdminApiKey` |

Do not rename headers during migration.

---

## TypeScript

- **Strict** types for services and Prisma models.
- Route handlers: validate body/query with Zod in `src/lib/validators/` when useful.
- Prefer `import type` for types-only imports.

---

## Database

- **Prisma** is the only ORM in `backend/`.
- Do not add Mongoose to this package.
- After step 01, schema changes go through `src/prisma/schema.prisma` and migrations/`db push`.

---

## Errors and responses

Preserve legacy JSON shapes where the frontend depends on them:

- `401` with `{ msg, code?: 'TOKEN_EXPIRED' }` for expired JWT (see legacy auth).
- `400` / `404` / `500` with `{ msg: string }` for most routes.

---

## Investment timing

Investment term length is configured in [`src/lib/config/investmentTiming.ts`](src/lib/config/investmentTiming.ts) using duration strings (`90D`, `12H`, `30Mi`, `3Mo`). Optional env override: `INVESTMENT_TERM` (see [`backend/.env.example`](.env.example)). Payouts are manual via admin; changing term affects **new** investments only. Parser: [`src/lib/duration/parseDuration.ts`](src/lib/duration/parseDuration.ts).

---

## Tests

- Unit tests: `src/**/*.test.ts` or `test/*.test.ts` (Node test runner).
- Port legacy tests from `backend-legacy/test/` when touching the same module.

---

## What not to put in this repo

- Expo mobile UI (stays in [`frontend/`](../frontend/)).
- Duplicate revenue-engine math in admin-only code paths — call `src/services/revenueEngine/`.

---

## Migration workflow

Follow [`plan/README.md`](plan/README.md). Apply **one step at a time**; do not skip prerequisites.
